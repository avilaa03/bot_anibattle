const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const {
    getBattle,
    getBattleByUserId,
    addCardToDeck,
    bothDecksReady,
    claimForResolution,
    finishBattle,
    cancelBattle,
    releaseWager
} = require('../utils/battleState');
const { runBattle } = require('../utils/battleEngine');
const { addBalance } = require('../utils/economy');
const elo = require('../utils/elo');
const { registrar } = require('../utils/progresso');
const { anunciarConquistas } = require('../utils/notificacoes');
const { buildDeckChoiceMessage } = require('../actions/collect/battleCollect');

/** Busca o inventário atual do jogador direto do banco. */
async function carregarInventario(userId) {
    const doc = await User.findOne({ id: userId }).select('inventory').lean();
    return doc?.inventory || [];
}

/**
 * customId: battle_pick_<battleId>_<X|Y>_<cardId>
 */
async function handleBattlePick(client, interaction) {
    const parts = interaction.customId.split('_');
    if (parts.length < 5) return false;
    const battleId = String(parts[2]);
    const side = parts[3];
    const cardId = parts.slice(4).join('_');

    let battle = await getBattle(battleId);
    if (!battle) {
        battle = await getBattleByUserId(interaction.user.id);
        if (!battle) {
            await interaction.reply({ content: 'Esta batalha expirou ou já foi concluída.', ephemeral: true }).catch(() => {});
            return true;
        }
    }

    const isX = side === 'X';
    const donoDoLado = isX ? battle.userX.id : battle.userY.id;
    if (donoDoLado !== interaction.user.id) {
        await interaction.reply({ content: 'Você não é um dos jogadores desta batalha.', ephemeral: true }).catch(() => {});
        return true;
    }

    const jaEscolhidas = isX ? battle.selectedIdsX : battle.selectedIdsY;
    if (jaEscolhidas.map(String).includes(cardId)) {
        await interaction.reply({ content: 'Você já escolheu esta carta.', ephemeral: true }).catch(() => {});
        return true;
    }

    const inventario = await carregarInventario(interaction.user.id);
    const card = inventario.find((c) => String(c._id) === cardId);
    if (!card) {
        await interaction.reply({ content: 'Essa carta não está mais no seu inventário.', ephemeral: true }).catch(() => {});
        return true;
    }

    await interaction.deferUpdate();

    // A escrita é atômica: se o jogador clicar rápido em quatro cartas, o
    // banco recusa a quarta em vez de aceitarmos um deck inválido.
    const atualizada = await addCardToDeck(battle.battleId, side, card);
    if (!atualizada) {
        await interaction.followUp({ content: 'Você já escolheu 3 cartas! Aguarde o oponente.', ephemeral: true }).catch(() => {});
        return true;
    }
    battle = atualizada;

    const deckAtual = isX ? battle.deckX : battle.deckY;

    // Redesenha a tela de escolha de quem clicou.
    try {
        const conteudo = buildDeckChoiceMessage(
            battle.battleId,
            side,
            inventario,
            isX ? battle.selectedIdsX : battle.selectedIdsY,
            deckAtual,
            battle.wager
        );
        const canalId = isX ? battle.channelXId : battle.channelYId;
        const mensagemId = isX ? battle.messageXId : battle.messageYId;
        const channel = await client.channels.fetch(canalId).catch(() => null);
        if (channel) {
            const msg = await channel.messages.fetch(mensagemId).catch(() => null);
            if (msg) await msg.edit({ embeds: [conteudo.embed], components: conteudo.components }).catch(() => {});
        }
    } catch (err) {
        console.error('Erro ao atualizar mensagem de escolha:', err);
    }

    await interaction.followUp({
        content: `**${ui.cardName(card.name)}** entrou no seu time! (${deckAtual.length}/3)`,
        ephemeral: true
    }).catch(() => {});

    if (!bothDecksReady(battle)) return true;

    // Trava a batalha para resolução. Se dois cliques chegarem juntos, só
    // um consegue — o outro recebe null e não paga a aposta de novo.
    const travada = await claimForResolution(battle.battleId);
    if (!travada) return true;

    await resolverBatalha(client, travada);
    return true;
}

/**
 * Confere no banco se o jogador ainda possui as três cartas escolhidas.
 *
 * Isto impede a trapaça mais óbvia do sistema antigo: escolher o time,
 * vender as cartas no mercado e mesmo assim batalhar com elas.
 */
async function validarPosse(userId, deck) {
    const atual = await User.findOne({ id: userId }).select('inventory._id').lean();
    if (!atual) return { ok: false, faltando: deck.map((c) => c.name) };

    const possui = new Set((atual.inventory || []).map((c) => String(c._id)));
    const faltando = deck.filter((c) => !possui.has(String(c._id))).map((c) => c.name);

    return { ok: faltando.length === 0, faltando };
}

async function enviarNoPrivado(client, userId, payload) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) await user.send(payload).catch(() => {});
}

async function resolverBatalha(client, battle) {
    const canal = await client.channels.fetch(battle.challengeChannelId).catch(() => null);
    const wager = battle.wager || 0;
    const nomeX = battle.userX.username || 'Jogador 1';
    const nomeY = battle.userY.username || 'Jogador 2';

    const [posseX, posseY] = await Promise.all([
        validarPosse(battle.userX.id, battle.deckX),
        validarPosse(battle.userY.id, battle.deckY)
    ]);

    if (!posseX.ok || !posseY.ok) {
        // Alguém não tem mais as cartas: cancela devolvendo as apostas.
        await cancelBattle(battle.battleId);

        const culpados = [];
        if (!posseX.ok) culpados.push(`**${nomeX}** (${posseX.faltando.join(', ')})`);
        if (!posseY.ok) culpados.push(`**${nomeY}** (${posseY.faltando.join(', ')})`);

        const embed = ui.error('Batalha cancelada', `Cartas escolhidas não estão mais no inventário de ${culpados.join(' e ')}.${wager > 0 ? '\n\nAs apostas foram devolvidas.' : ''}`);
        if (canal) await canal.send({ embeds: [embed] }).catch(() => {});
        return;
    }

    const result = runBattle(battle.deckX, battle.deckY);
    const vencedorId = result.winner === 'X' ? battle.userX.id : result.winner === 'Y' ? battle.userY.id : null;
    const perdedorId = result.winner === 'X' ? battle.userY.id : result.winner === 'Y' ? battle.userX.id : null;
    const nomeVencedor = result.winner === 'X' ? nomeX : nomeY;
    const nomePerdedor = result.winner === 'X' ? nomeY : nomeX;

    const placar = `**${result.winsX}** — **${result.winsY}**`;

    const resultEmbed = ui.base(result.winner ? 0xFFD700 : ui.STATUS_COLORS.neutral)
        .setTitle(result.winner ? '⚔️ Fim da batalha' : '⚔️ Empate')
        .setDescription(
            result.winner
                ? `👑 **${nomeVencedor}** venceu — ${nomeX} ${placar} ${nomeY}`
                : `Ninguém levou vantagem — ${nomeX} ${placar} ${nomeY}`
        );

    const roundLines = result.rounds.map((r) => {
        const venceuX = r.winner === 'A';
        const quemVenceu = venceuX ? nomeX : nomeY;
        const destaques = r.log.filter((l) => l.includes('CRÍTICO') || l.includes('VIRADA') || l.includes('esquivou'));
        const extra = destaques.length > 0 ? `\n└ ${destaques[destaques.length - 1]}` : '';
        return `\`R${r.round}\` ${venceuX ? '🟢' : '🔴'} **${ui.cardName(r.cardX)}** vs **${ui.cardName(r.cardY)}** → ${quemVenceu}${extra}`;
    }).join('\n');

    resultEmbed.addFields({ name: 'Rodadas', value: roundLines.slice(0, 1024), inline: false });

    if (wager > 0) {
        if (vencedorId) {
            const atualizado = await addBalance(vencedorId, wager * 2);
            await releaseWager(battle.battleId);
            resultEmbed.addFields({
                name: '💰 Aposta',
                value: `👑 **${nomeVencedor}** levou ${ui.coins(wager * 2)}\n💸 **${nomePerdedor}** perdeu ${ui.coins(wager)}\n\nSaldo do vencedor: ${ui.coins(atualizado?.balance ?? 0)}`,
                inline: false
            });
        } else {
            await addBalance(battle.userX.id, wager);
            await addBalance(battle.userY.id, wager);
            await releaseWager(battle.battleId);
            resultEmbed.addFields({
                name: '💰 Aposta',
                value: `Empate — cada jogador recebeu ${ui.coins(wager)} de volta.`,
                inline: false
            });
        }
    }

    // ---- Pontuação de ranking ----
    const [docX, docY] = await Promise.all([
        User.findOne({ id: battle.userX.id }).select('elo picoElo').lean(),
        User.findOne({ id: battle.userY.id }).select('elo picoElo').lean()
    ]);
    const eloX = docX?.elo ?? elo.ELO_INICIAL;
    const eloY = docY?.elo ?? elo.ELO_INICIAL;

    if (vencedorId && perdedorId) {
        const eloVencedor = vencedorId === battle.userX.id ? eloX : eloY;
        const eloPerdedor = vencedorId === battle.userX.id ? eloY : eloX;
        const r = elo.calcular(eloVencedor, eloPerdedor);

        await User.updateOne(
            { id: vencedorId },
            { $inc: { wins: 1 }, $set: { elo: r.vencedor, picoElo: Math.max(r.vencedor, vencedorId === battle.userX.id ? (docX?.picoElo ?? eloX) : (docY?.picoElo ?? eloY)) } }
        );
        await User.updateOne({ id: perdedorId }, { $inc: { losses: 1 }, $set: { elo: r.perdedor } });

        const divVencedor = elo.divisao(r.vencedor);
        const divPerdedor = elo.divisao(r.perdedor);

        resultEmbed.addFields({
            name: '📊 Ranking',
            value: `👑 **${nomeVencedor}** ${divVencedor.emoji} ${ui.number(r.vencedor)} pts (**+${r.ganho}**)\n`
                + `💤 **${nomePerdedor}** ${divPerdedor.emoji} ${ui.number(r.perdedor)} pts (**-${r.perda}**)`,
            inline: false
        });
    } else {
        const r = elo.calcularEmpate(eloX, eloY);
        await User.updateOne({ id: battle.userX.id }, { $set: { elo: r.a } });
        await User.updateOne({ id: battle.userY.id }, { $set: { elo: r.b } });
    }

    if (canal) {
        await canal.send({
            content: `<@${battle.userX.id}> vs <@${battle.userY.id}>`,
            embeds: [resultEmbed]
        }).catch(() => {});
    }

    await enviarNoPrivado(client, battle.userX.id, { embeds: [resultEmbed] });
    await enviarNoPrivado(client, battle.userY.id, { embeds: [resultEmbed] });

    // Conta críticos e viradas da luta toda, para missões e conquistas.
    const logCompleto = result.rounds.flatMap((r) => r.log).join('\n');
    const criticos = (logCompleto.match(/CRÍTICO/g) || []).length;
    const viradas = (logCompleto.match(/VIRADA/g) || []).length;

    const eventosVencedor = ['batalha', 'vitoria', ...Array(criticos).fill('critico')];
    const eventosPerdedor = ['batalha'];

    const progresso = [];
    if (vencedorId && perdedorId) {
        progresso.push(
            registrar(vencedorId, { batalhasVencidas: 1, criticos, viradas }, { eventosMissao: eventosVencedor }),
            registrar(perdedorId, { batalhasPerdidas: 1 }, { eventosMissao: eventosPerdedor })
        );
    } else {
        progresso.push(
            registrar(battle.userX.id, {}, { eventosMissao: ['batalha'] }),
            registrar(battle.userY.id, {}, { eventosMissao: ['batalha'] })
        );
    }

    // Troféus: comuns no privado, raros anunciados no canal do duelo.
    const resultados = await Promise.all(progresso).catch(() => []);
    for (let i = 0; i < resultados.length; i++) {
        const conquistas = resultados[i]?.conquistas || [];
        if (conquistas.length === 0) continue;
        const destinatario = vencedorId && perdedorId
            ? (i === 0 ? vencedorId : perdedorId)
            : (i === 0 ? battle.userX.id : battle.userY.id);
        await anunciarConquistas(client, destinatario, conquistas, canal);
    }

    await finishBattle(battle.battleId);
}

module.exports = { handleBattlePick, validarPosse };
