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
const { runBattle, narrar } = require('../utils/battleEngine');
const { tDaInteracao, tDoUsuario } = require('../utils/idioma');
const { addBalance } = require('../utils/economy');
const elo = require('../utils/elo');
const { registrar } = require('../utils/progresso');
const { anunciarConquistas } = require('../utils/notificacoes');
const { buildDeckChoiceMessage } = require('../actions/collect/battleCollect');
const { MessageFlags } = require('discord.js');

/** Busca o inventário atual do jogador direto do banco. */
async function carregarInventario(userId) {
    const doc = await User.findOne({ id: userId }).select('inventory').lean();
    return doc?.inventory || [];
}

/**
 * customId: battle_pick_<battleId>_<X|Y>_<cardId>
 */
async function handleBattlePick(client, interaction) {
    // Tudo aqui é resposta direta a um clique, e o clique acontece na DM
    // do jogador — então é sempre o idioma dele, nunca o do oponente.
    const t = await tDaInteracao(interaction);

    const parts = interaction.customId.split('_');
    if (parts.length < 5) return false;
    const battleId = String(parts[2]);
    const side = parts[3];
    const cardId = parts.slice(4).join('_');

    let battle = await getBattle(battleId);
    if (!battle) {
        battle = await getBattleByUserId(interaction.user.id);
        if (!battle) {
            await interaction.reply({ content: t('battle.expirou_ou_concluida'), flags: MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }
    }

    const isX = side === 'X';
    const donoDoLado = isX ? battle.userX.id : battle.userY.id;
    if (donoDoLado !== interaction.user.id) {
        await interaction.reply({ content: t('battle.nao_e_jogador'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const jaEscolhidas = isX ? battle.selectedIdsX : battle.selectedIdsY;
    if (jaEscolhidas.map(String).includes(cardId)) {
        await interaction.reply({ content: t('battle.carta_ja_escolhida'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const inventario = await carregarInventario(interaction.user.id);
    const card = inventario.find((c) => String(c._id) === cardId);
    if (!card) {
        await interaction.reply({ content: t('sell.sumiu_do_inventario'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    await interaction.deferUpdate();

    // A escrita é atômica: se o jogador clicar rápido em quatro cartas, o
    // banco recusa a quarta em vez de aceitarmos um deck inválido.
    const atualizada = await addCardToDeck(battle.battleId, side, card);
    if (!atualizada) {
        await interaction.followUp({ content: t('battle.ja_tem_3'), flags: MessageFlags.Ephemeral }).catch(() => {});
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
            battle.wager,
            t
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
        content: t('battle.carta_no_time', { carta: ui.cardName(card.name, t.locale), n: deckAtual.length }),
        flags: MessageFlags.Ephemeral
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
    const guildId = canal?.guildId || null;

    // O resultado vai para três lugares: o canal do desafio e a DM de
    // cada jogador. Como os três podem estar em idiomas diferentes, o
    // embed é MONTADO por idioma — daí ele nascer dentro de uma função
    // em vez de ser uma variável só.
    const [tCanal, tX, tY] = await Promise.all([
        tDoUsuario(null, guildId),
        tDoUsuario(battle.userX.id, guildId),
        tDoUsuario(battle.userY.id, guildId)
    ]);

    const nomeX = battle.userX.username || tCanal('battle.jogador_1');
    const nomeY = battle.userY.username || tCanal('battle.jogador_2');

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

        const embed = ui.error(
            tCanal('battle.cancelada'),
            tCanal('battle.cancelada_texto', { culpados: culpados.join(tCanal('battle.e')) })
                + (wager > 0 ? `\n\n${tCanal('battle.apostas_devolvidas')}` : '')
        );
        if (canal) await canal.send({ embeds: [embed] }).catch(() => {});
        return;
    }

    const result = runBattle(battle.deckX, battle.deckY);
    const vencedorId = result.winner === 'X' ? battle.userX.id : result.winner === 'Y' ? battle.userY.id : null;
    const perdedorId = result.winner === 'X' ? battle.userY.id : result.winner === 'Y' ? battle.userX.id : null;
    const nomeVencedor = result.winner === 'X' ? nomeX : nomeY;
    const nomePerdedor = result.winner === 'X' ? nomeY : nomeX;

    // ---- Efeitos no banco (uma vez só, independente de idioma) ----
    let saldoVencedor = 0;
    if (wager > 0) {
        if (vencedorId) {
            const atualizado = await addBalance(vencedorId, wager * 2);
            saldoVencedor = atualizado?.balance ?? 0;
        } else {
            await addBalance(battle.userX.id, wager);
            await addBalance(battle.userY.id, wager);
        }
        await releaseWager(battle.battleId);
    }

    const [docX, docY] = await Promise.all([
        User.findOne({ id: battle.userX.id }).select('elo picoElo').lean(),
        User.findOne({ id: battle.userY.id }).select('elo picoElo').lean()
    ]);
    const eloX = docX?.elo ?? elo.ELO_INICIAL;
    const eloY = docY?.elo ?? elo.ELO_INICIAL;

    let rankingResultado = null;
    if (vencedorId && perdedorId) {
        const eloVencedor = vencedorId === battle.userX.id ? eloX : eloY;
        const eloPerdedor = vencedorId === battle.userX.id ? eloY : eloX;
        const r = elo.calcular(eloVencedor, eloPerdedor);

        await User.updateOne(
            { id: vencedorId },
            { $inc: { wins: 1 }, $set: { elo: r.vencedor, picoElo: Math.max(r.vencedor, vencedorId === battle.userX.id ? (docX?.picoElo ?? eloX) : (docY?.picoElo ?? eloY)) } }
        );
        await User.updateOne({ id: perdedorId }, { $inc: { losses: 1 }, $set: { elo: r.perdedor } });
        rankingResultado = r;
    } else {
        const r = elo.calcularEmpate(eloX, eloY);
        await User.updateOne({ id: battle.userX.id }, { $set: { elo: r.a } });
        await User.updateOne({ id: battle.userY.id }, { $set: { elo: r.b } });
    }

    // ---- Montagem do embed, por idioma ----
    const montarResultado = (t) => {
        const placar = `**${result.winsX}** — **${result.winsY}**`;

        const embed = ui.base(result.winner ? 0xFFD700 : ui.STATUS_COLORS.neutral)
            .setTitle(result.winner ? t('battle.fim_titulo') : t('battle.empate_titulo'))
            .setDescription(
                result.winner
                    ? t('battle.fim_texto', { vencedor: nomeVencedor, x: nomeX, placar, y: nomeY })
                    : t('battle.empate_texto', { x: nomeX, placar, y: nomeY })
            );

        const roundLines = result.rounds.map((r) => {
            const venceuX = r.winner === 'A';
            const quemVenceu = venceuX ? nomeX : nomeY;
            // Só os lances que valem menção: crítico, virada e esquiva.
            const destaques = r.log.filter((e) =>
                e.tipo === 'esquiva' || (e.tipo === 'golpe' && (e.crit || e.desperate)));
            const extra = destaques.length > 0
                ? `\n└ ${narrar(destaques[destaques.length - 1], t)}`
                : '';
            return `\`R${r.round}\` ${venceuX ? '🟢' : '🔴'} **${ui.cardName(r.cardX, t.locale)}** vs **${ui.cardName(r.cardY, t.locale)}** → ${quemVenceu}${extra}`;
        }).join('\n');

        embed.addFields({ name: t('battle.rodadas'), value: roundLines.slice(0, 1024), inline: false });

        if (wager > 0) {
            embed.addFields({
                name: t('battle.aposta'),
                value: vencedorId
                    ? t('battle.aposta_vencedor', {
                        vencedor: nomeVencedor,
                        premio: ui.coins(wager * 2, t.locale),
                        perdedor: nomePerdedor,
                        perda: ui.coins(wager, t.locale),
                        saldo: ui.coins(saldoVencedor, t.locale)
                    })
                    : t('battle.aposta_empate', { valor: ui.coins(wager, t.locale) }),
                inline: false
            });
        }

        if (rankingResultado) {
            const divVencedor = elo.divisao(rankingResultado.vencedor, t.locale);
            const divPerdedor = elo.divisao(rankingResultado.perdedor, t.locale);
            embed.addFields({
                name: t('battle.ranking'),
                value: t('battle.ranking_texto', {
                    vencedor: nomeVencedor,
                    emojiV: divVencedor.emoji,
                    ptsV: ui.number(rankingResultado.vencedor, t.locale),
                    ganho: rankingResultado.ganho,
                    perdedor: nomePerdedor,
                    emojiP: divPerdedor.emoji,
                    ptsP: ui.number(rankingResultado.perdedor, t.locale),
                    perda: rankingResultado.perda
                }),
                inline: false
            });
        }

        return embed;
    };

    if (canal) {
        await canal.send({
            content: `<@${battle.userX.id}> vs <@${battle.userY.id}>`,
            embeds: [montarResultado(tCanal)]
        }).catch(() => {});
    }

    await enviarNoPrivado(client, battle.userX.id, { embeds: [montarResultado(tX)] });
    await enviarNoPrivado(client, battle.userY.id, { embeds: [montarResultado(tY)] });

    // Críticos e viradas da luta toda, para missões e conquistas. Vêm
    // contados do motor — antes eram extraídos do log com regex, o que
    // deixaria de funcionar no momento em que o log fosse traduzido.
    const criticos = result.criticos;
    const viradas = result.viradas;

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
        // O troféu sai no idioma de quem conquistou, mesmo quando é
        // anunciado no canal — a mensagem é sobre essa pessoa.
        const tDono = destinatario === battle.userX.id ? tX : tY;
        await anunciarConquistas(client, destinatario, conquistas, canal, tDono.locale);
    }

    await finishBattle(battle.battleId);
}

module.exports = { handleBattlePick, validarPosse };
