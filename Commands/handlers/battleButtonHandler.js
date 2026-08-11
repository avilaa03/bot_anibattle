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
const { registrar } = require('../utils/progress');
const { anunciarConquistas } = require('../utils/notifications');
const { buildDeckChoiceMessage } = require('../actions/collect/battleCollect');
const { MessageFlags } = require('discord.js');
const { podeCancelarBatalha, mensagem } = require('../utils/lifecycle');
const transmissao = require('../utils/broadcast');
const { montarEmbedResultado, contarDestaques } = require('../utils/battleResult');
const { tDaInteracao, tDoUsuario } = require('../utils/language');

/** Busca o inventário atual do jogador direto do banco. */
async function carregarInventario(userId) {
    const doc = await User.findOne({ id: userId }).select('inventory').lean();
    return doc?.inventory || [];
}

/**
 * Desistência durante a escolha do time.
 *
 * customId: battle_cancel_<battleId>
 *
 * Só vale enquanto a fase é 'choosing'. Depois que a luta começou o
 * resultado já foi calculado e a aposta resolvida — cancelar ali seria
 * desfazer uma derrota. A regra mora em `cicloDeVida.js`.
 */
async function handleBattleCancel(client, interaction) {
    const battleId = interaction.customId.slice('battle_cancel_'.length);
    const t = await tDaInteracao(interaction);

    let battle = await getBattle(battleId);
    if (!battle) battle = await getBattleByUserId(interaction.user.id);

    if (!battle) {
        await interaction.reply({
            embeds: [ui.neutral(t('battle.nada_para_cancelar'), t('battle.nada_para_cancelar_texto'))],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    const permissao = podeCancelarBatalha(battle, interaction.user.id);
    if (!permissao.ok) {
        await interaction.reply({
            embeds: [ui.error(t('battle.nao_da_para_desistir'), mensagem(permissao.motivo, t.locale))],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // cancelBattle devolve a aposta dos dois lados se ela estiver retida.
    const cancelada = await cancelBattle(battle.battleId);
    if (!cancelada) {
        await interaction.reply({
            embeds: [ui.neutral(t('battle.nada_para_cancelar'), t('battle.ja_encerrada'))],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // O aviso vai para DUAS telas, uma por jogador, cada uma no privado
    // dele — então ele é montado uma vez por idioma, e não uma vez só.
    // Reaproveitar o embed de quem clicou mandaria o texto no idioma do
    // desistente para quem só está esperando.
    const montarAviso = (tradutor) => {
        const aposta = cancelada.wager > 0 && cancelada.wagerHeld
            ? `\n\n${tradutor('battle.aposta_devolvida', { valor: ui.coins(cancelada.wager, tradutor.locale) })}`
            : '';
        return ui.neutral(
            tradutor('battle.duelo_cancelado'),
            tradutor('battle.duelo_cancelado_texto', { jogador: interaction.user.username }) + aposta
        );
    };

    await interaction.update({ embeds: [montarAviso(t)], components: [] }).catch(() => {});

    // O outro jogador está numa mensagem diferente (cada um escolhe o time
    // no próprio privado). Sem avisar, ele ficaria escolhendo cartas para
    // um duelo que não existe mais.
    const souX = cancelada.userX.id === interaction.user.id;
    const outroId = souX ? cancelada.userY.id : cancelada.userX.id;
    const canalOutro = souX ? cancelada.channelYId : cancelada.channelXId;
    const mensagemOutro = souX ? cancelada.messageYId : cancelada.messageXId;

    if (canalOutro && mensagemOutro) {
        try {
            const tOutro = await tDoUsuario(outroId, interaction.guildId);
            const canal = await client.channels.fetch(canalOutro);
            const msg = await canal.messages.fetch(mensagemOutro);
            await msg.edit({ embeds: [montarAviso(tOutro)], components: [] });
        } catch {
            // Mensagem apagada ou privado fechado: a batalha já foi
            // cancelada no banco e a aposta devolvida, que é o que importa.
        }
    }

    return true;
}

/**
 * Escolha de uma carta para o time.
 *
 * customId: battle_pick_<battleId>_<X|Y>_<cardId>
 */
async function handleBattlePick(client, interaction) {
    const parts = interaction.customId.split('_');
    if (parts.length < 5) return false;
    const battleId = String(parts[2]);
    const side = parts[3];
    const cardId = parts.slice(4).join('_');
    const t = await tDaInteracao(interaction);

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
        await interaction.reply({ content: t('battle.carta_fora_do_inventario'), flags: MessageFlags.Ephemeral }).catch(() => {});
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
        content: t('battle.carta_no_time', { carta: ui.cardName(card), n: deckAtual.length }),
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

    // Três vozes, porque são três destinos com donos diferentes.
    //
    // A luta é transmitida no canal, e o resultado também vai para o
    // privado de cada jogador. O canal é do servidor; o privado é de quem
    // recebe. Montar um embed só e mandar para os três lugares faria dois
    // dos três lerem no idioma errado — e aqui não há nem "quem clicou"
    // para servir de desempate, porque a batalha resolve sozinha quando a
    // sexta carta é escolhida.
    //
    // O guildId sai do canal em vez do banco: a batalha não guarda o
    // servidor, e acrescentar o campo seria migração de dado em produção
    // para uma informação que já está a um `fetch` de distância.
    const guildId = canal?.guildId ?? null;
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

    // Empate não existe no 3v3: são três confrontos, cada um com um
    // vencedor, então o placar é sempre 2-1 ou 3-0. `winner` é 'X' ou 'Y'.
    const result = runBattle(battle.deckX, battle.deckY);
    const venceuX = result.winner === 'X';
    const vencedorId = venceuX ? battle.userX.id : battle.userY.id;
    const perdedorId = venceuX ? battle.userY.id : battle.userX.id;
    const nomeVencedor = venceuX ? nomeX : nomeY;
    const nomePerdedor = venceuX ? nomeY : nomeX;

    // A tela final é a mesma do `/treino` — placar, vencedor e rodadas
    // saem de `utils/resultadoBatalha.js`. Aposta e ranking, que só
    // existem aqui, entram como campos extras logo abaixo.
    //
    // Um embed por idioma: o do canal e o de cada privado. Os três contam
    // a MESMA luta, com os mesmos números — só a língua muda.
    const saldoVencedor = wager > 0 ? (await addBalance(vencedorId, wager * 2)) : null;
    if (wager > 0) await releaseWager(battle.battleId);

    // ---- Pontuação de ranking ----
    const [docX, docY] = await Promise.all([
        User.findOne({ id: battle.userX.id }).select('elo picoElo').lean(),
        User.findOne({ id: battle.userY.id }).select('elo picoElo').lean()
    ]);
    const eloX = docX?.elo ?? elo.ELO_INICIAL;
    const eloY = docY?.elo ?? elo.ELO_INICIAL;

    const eloVencedor = venceuX ? eloX : eloY;
    const eloPerdedor = venceuX ? eloY : eloX;
    const picoVencedor = venceuX ? (docX?.picoElo ?? eloX) : (docY?.picoElo ?? eloY);
    const r = elo.calcular(eloVencedor, eloPerdedor);

    await User.updateOne(
        { id: vencedorId },
        { $inc: { wins: 1 }, $set: { elo: r.vencedor, picoElo: Math.max(r.vencedor, picoVencedor) } }
    );
    await User.updateOne({ id: perdedorId }, { $inc: { losses: 1 }, $set: { elo: r.perdedor } });

    /**
     * A tela final inteira, num idioma.
     *
     * Chamada uma vez por destino. É o mesmo `result` nas três, então
     * placar, ELO e aposta são obrigatoriamente idênticos — a função não
     * recebe nada que possa divergir entre as versões.
     */
    const montarTelaFinal = (tradutor) => {
        const embed = montarEmbedResultado({ nomeX, nomeY, resultado: result, t: tradutor });

        if (wager > 0) {
            embed.addFields({
                name: tradutor('battle.aposta'),
                value: tradutor('battle.aposta_vencedor', {
                    vencedor: nomeVencedor,
                    premio: ui.coins(wager * 2, tradutor.locale),
                    perdedor: nomePerdedor,
                    perda: ui.coins(wager, tradutor.locale),
                    saldo: ui.coins(saldoVencedor?.balance ?? 0, tradutor.locale)
                }),
                inline: false
            });
        }

        embed.addFields({
            name: tradutor('battle.ranking'),
            value: tradutor('battle.ranking_texto', {
                vencedor: nomeVencedor,
                emojiV: elo.divisao(r.vencedor, tradutor.locale).emoji,
                ptsV: ui.number(r.vencedor, tradutor.locale),
                ganho: r.ganho,
                perdedor: nomePerdedor,
                emojiP: elo.divisao(r.perdedor, tradutor.locale).emoji,
                ptsP: ui.number(r.perdedor, tradutor.locale),
                perda: r.perda
            }),
            inline: false
        });

        return embed;
    };

    // ---- Transmissão ao vivo ----
    //
    // Tudo que importa já aconteceu: o resultado está calculado, a aposta
    // resolvida e o ELO gravado. A animação abaixo só reencena, e por isso
    // pode falhar sem consequência — o resultado sai logo depois de
    // qualquer jeito.
    //
    // A luta é transmitida no canal do servidor, não no privado, para os
    // dois acompanharem juntos e o resto do servidor torcer.
    const mencao = `<@${battle.userX.id}> vs <@${battle.userY.id}>`;

    if (canal) {
        try {
            await transmissao.transmitir({
                canal, nomeX, nomeY, mencao, resultado: result, wager, t: tCanal
            });
        } catch (err) {
            // Nunca deixar a animação derrubar a entrega do resultado.
            console.error('Erro na transmissão da batalha (resultado não afetado):', err.message);
        }

        await canal.send({ content: mencao, embeds: [montarTelaFinal(tCanal)] }).catch(() => {});
    }

    // No privado vai só o resultado, e no idioma de cada um: quem quis
    // assistir estava no canal.
    await enviarNoPrivado(client, battle.userX.id, { embeds: [montarTelaFinal(tX)] });
    await enviarNoPrivado(client, battle.userY.id, { embeds: [montarTelaFinal(tY)] });

    // Conta críticos e viradas da luta toda, para missões e conquistas.
    const { criticos, viradas } = contarDestaques(result);

    const eventosVencedor = ['batalha', 'vitoria', ...Array(criticos).fill('critico')];
    const eventosPerdedor = ['batalha'];

    const progresso = [
        registrar(vencedorId, { batalhasVencidas: 1, criticos, viradas }, { eventosMissao: eventosVencedor }),
        registrar(perdedorId, { batalhasPerdidas: 1 }, { eventosMissao: eventosPerdedor })
    ];

    // Troféus: comuns no privado, raros anunciados no canal do duelo.
    const resultados = await Promise.all(progresso).catch(() => []);
    for (let i = 0; i < resultados.length; i++) {
        const conquistas = resultados[i]?.conquistas || [];
        if (conquistas.length === 0) continue;
        await anunciarConquistas(client, i === 0 ? vencedorId : perdedorId, conquistas, canal);
    }

    await finishBattle(battle.battleId);
}

module.exports = { handleBattlePick, handleBattleCancel, validarPosse };
