const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const {
    getBattle,
    getBattleByUserId,
    addCardToDeck,
    bothDecksReady,
    finishBattle
} = require('../utils/battleState');
const { runBattle } = require('../utils/battleEngine');
const { addBalance } = require('../utils/economy');
const { buildDeckChoiceMessage } = require('../actions/collect/battleCollect');

/**
 * customId: battle_pick_<battleId>_<X|Y>_<cardId>
 */
async function handleBattlePick(client, interaction) {
    const parts = interaction.customId.split('_');
    if (parts.length < 5) return false;
    const battleId = String(parts[2]);
    const side = parts[3];
    const cardId = parts.slice(4).join('_');

    let state = getBattle(battleId);
    if (!state) {
        state = getBattleByUserId(interaction.user.id);
        if (!state) {
            await interaction.reply({ content: 'Esta batalha expirou ou já foi concluída.', ephemeral: true }).catch(() => {});
            return true;
        }
    }
    const effectiveBattleId = state.battleId;

    const isX = side === 'X';
    const userId = interaction.user.id;
    if (isX && state.userX.id !== userId) {
        await interaction.reply({ content: 'Você não é um dos jogadores desta batalha.', ephemeral: true }).catch(() => {});
        return true;
    }
    if (!isX && state.userY.id !== userId) {
        await interaction.reply({ content: 'Você não é um dos jogadores desta batalha.', ephemeral: true }).catch(() => {});
        return true;
    }

    const selectedIds = isX ? state.selectedIdsX : state.selectedIdsY;
    const inventory = isX ? state.userXData.inventory : state.userYData.inventory;
    const deck = isX ? state.deckX : state.deckY;

    if (selectedIds.has(cardId)) {
        await interaction.reply({ content: 'Você já escolheu esta carta.', ephemeral: true }).catch(() => {});
        return true;
    }
    if (deck.length >= 3) {
        await interaction.reply({ content: 'Você já escolheu 3 cartas! Aguarde o oponente.', ephemeral: true }).catch(() => {});
        return true;
    }

    const card = inventory.find((c) => String(c._id) === cardId);
    if (!card) {
        await interaction.reply({ content: 'Carta inválida.', ephemeral: true }).catch(() => {});
        return true;
    }

    await interaction.deferUpdate();

    addCardToDeck(effectiveBattleId, side, card);
    selectedIds.add(cardId);

    const msgXContent = buildDeckChoiceMessage(effectiveBattleId, 'X', state.userXData.inventory, state.selectedIdsX, state.deckX, state.wager);
    const msgYContent = buildDeckChoiceMessage(effectiveBattleId, 'Y', state.userYData.inventory, state.selectedIdsY, state.deckY, state.wager);

    try {
        const conteudo = isX ? msgXContent : msgYContent;
        const canalId = isX ? state.channelXId : state.channelYId;
        const mensagemId = isX ? state.messageXId : state.messageYId;
        const channel = await client.channels.fetch(canalId).catch(() => null);
        if (channel) {
            const msg = await channel.messages.fetch(mensagemId).catch(() => null);
            if (msg) await msg.edit({ embeds: [conteudo.embed], components: conteudo.components }).catch(() => {});
        }
    } catch (err) {
        console.error('Erro ao atualizar mensagem de escolha:', err);
    }

    await interaction.followUp({
        content: `**${ui.cardName(card.name)}** entrou no seu time! (${deck.length}/3)`,
        ephemeral: true
    }).catch(() => {});

    if (!bothDecksReady(state)) return true;

    state.phase = 'fighting';
    await resolverBatalha(client, state);
    return true;
}

/**
 * Confere no banco se o jogador ainda possui as três cartas escolhidas.
 *
 * Isto é o que impedia a trapaça mais óbvia do sistema antigo: escolher o
 * time, vender as cartas no mercado e mesmo assim batalhar com elas. O
 * inventário guardado no estado é um retrato de quando o duelo começou, e
 * pode estar desatualizado — a fonte da verdade é o banco.
 */
async function validarPosse(userId, deck) {
    const atual = await User.findOne({ id: userId }).select('inventory._id').lean();
    if (!atual) return { ok: false, faltando: deck.map((c) => c.name) };

    const possui = new Set((atual.inventory || []).map((c) => String(c._id)));
    const faltando = deck.filter((c) => !possui.has(String(c._id))).map((c) => c.name);

    return { ok: faltando.length === 0, faltando };
}

async function resolverBatalha(client, state) {
    const canal = await client.channels.fetch(state.challengeChannelId).catch(() => null);
    const wager = state.wager || 0;

    const [posseX, posseY] = await Promise.all([
        validarPosse(state.userX.id, state.deckX),
        validarPosse(state.userY.id, state.deckY)
    ]);

    if (!posseX.ok || !posseY.ok) {
        // Alguém não tem mais as cartas: cancela e devolve as apostas.
        if (wager > 0) {
            await addBalance(state.userX.id, wager);
            await addBalance(state.userY.id, wager);
        }

        const culpados = [];
        if (!posseX.ok) culpados.push(`**${state.userX.username}** (${posseX.faltando.join(', ')})`);
        if (!posseY.ok) culpados.push(`**${state.userY.username}** (${posseY.faltando.join(', ')})`);

        const embed = ui.error('Batalha cancelada', `Cartas escolhidas não estão mais no inventário de ${culpados.join(' e ')}.\n\n${wager > 0 ? 'As apostas foram devolvidas.' : ''}`);
        if (canal) await canal.send({ embeds: [embed] }).catch(() => {});
        finishBattle(state.battleId);
        return;
    }

    const result = runBattle(state.deckX, state.deckY);
    const winnerUser = result.winner === 'X' ? state.userX : result.winner === 'Y' ? state.userY : null;
    const loserUser = result.winner === 'X' ? state.userY : result.winner === 'Y' ? state.userX : null;

    const placar = `**${result.winsX}** — **${result.winsY}**`;

    const resultEmbed = ui.base(result.winner ? 0xFFD700 : ui.STATUS_COLORS.neutral)
        .setTitle(result.winner ? '⚔️ Fim da batalha' : '⚔️ Empate')
        .setDescription(
            result.winner
                ? `👑 **${winnerUser.username}** venceu — ${state.userX.username} ${placar} ${state.userY.username}`
                : `Ninguém levou vantagem — ${state.userX.username} ${placar} ${state.userY.username}`
        );

    // Narração: mostra os lances mais marcantes de cada rodada.
    const roundLines = result.rounds.map((r) => {
        const venceuX = r.winner === 'A';
        const nomeVencedor = venceuX ? state.userX.username : state.userY.username;
        const destaques = r.log.filter((l) => l.includes('CRÍTICO') || l.includes('VIRADA') || l.includes('esquivou'));
        const extra = destaques.length > 0 ? `\n└ ${destaques[destaques.length - 1]}` : '';
        return `\`R${r.round}\` ${venceuX ? '🟢' : '🔴'} **${ui.cardName(r.cardX)}** vs **${ui.cardName(r.cardY)}** → ${nomeVencedor}${extra}`;
    }).join('\n');

    resultEmbed.addFields({ name: 'Rodadas', value: roundLines.slice(0, 1024), inline: false });

    if (wager > 0) {
        if (winnerUser) {
            // Vencedor leva o pote inteiro (a própria aposta + a do outro).
            const atualizado = await addBalance(winnerUser.id, wager * 2);
            resultEmbed.addFields({
                name: '💰 Aposta',
                value: `👑 **${winnerUser.username}** levou ${ui.coins(wager * 2)}\n💸 **${loserUser.username}** perdeu ${ui.coins(wager)}\n\nSaldo do vencedor: ${ui.coins(atualizado?.balance ?? 0)}`,
                inline: false
            });
        } else {
            // Empate: cada um recebe a própria aposta de volta.
            await addBalance(state.userX.id, wager);
            await addBalance(state.userY.id, wager);
            resultEmbed.addFields({
                name: '💰 Aposta',
                value: `Empate — cada jogador recebeu ${ui.coins(wager)} de volta.`,
                inline: false
            });
        }
    }

    if (winnerUser && loserUser) {
        await User.updateOne({ id: winnerUser.id }, { $inc: { wins: 1 } });
        await User.updateOne({ id: loserUser.id }, { $inc: { losses: 1 } });
    }

    if (canal) {
        await canal.send({
            content: `${state.userX} vs ${state.userY}`,
            embeds: [resultEmbed]
        }).catch(() => {});
    }

    // Manda o resultado no privado dos dois também.
    await state.userX.send({ embeds: [resultEmbed] }).catch(() => {});
    await state.userY.send({ embeds: [resultEmbed] }).catch(() => {});

    finishBattle(state.battleId);
}

module.exports = { handleBattlePick, validarPosse };
