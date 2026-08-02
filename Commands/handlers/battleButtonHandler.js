const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const { getBattle, getBattleByUserId, addCardToDeck, bothDecksReady, finishBattle, COIN_WINNER, COIN_LOSER } = require('../utils/battleState');
const { runBattle } = require('../utils/battleEngine');
const { buildDeckChoiceMessage } = require('../actions/collect/battleCollect');

/**
 * customId: battle_pick_<battleId>_<X|Y>_<index>
 */
async function handleBattlePick(client, interaction) {
    const parts = interaction.customId.split('_');
    if (parts.length < 5) return false;
    const battleId = String(parts[2]);
    const side = parts[3];
    const index = parseInt(parts[4], 10);

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

    const selectedIndices = isX ? state.selectedIndicesX : state.selectedIndicesY;
    const inventory = isX ? state.userXData.inventory : state.userYData.inventory;
    const deck = isX ? state.deckX : state.deckY;

    if (selectedIndices.has(index)) {
        await interaction.reply({ content: 'Você já escolheu esta carta.', ephemeral: true }).catch(() => {});
        return true;
    }
    if (deck.length >= 3) {
        await interaction.reply({ content: 'Você já escolheu 3 cartas! Aguarde o oponente.', ephemeral: true }).catch(() => {});
        return true;
    }

    if (index < 0 || index >= inventory.length) {
        await interaction.reply({ content: 'Carta inválida.', ephemeral: true }).catch(() => {});
        return true;
    }

    await interaction.deferUpdate();

    const card = inventory[index];
    addCardToDeck(effectiveBattleId, side, card);
    selectedIndices.add(index);

    const invX = state.userXData.inventory;
    const invY = state.userYData.inventory;
    const msgXContent = buildDeckChoiceMessage(effectiveBattleId, 'X', invX, state.selectedIndicesX, state.deckX);
    const msgYContent = buildDeckChoiceMessage(effectiveBattleId, 'Y', invY, state.selectedIndicesY, state.deckY);

    try {
        if (isX) {
            const channel = await client.channels.fetch(state.channelXId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(state.messageXId).catch(() => null);
                if (msg) await msg.edit({ embeds: [msgXContent.embed], components: msgXContent.components }).catch(() => {});
            }
        } else {
            const channel = await client.channels.fetch(state.channelYId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(state.messageYId).catch(() => null);
                if (msg) await msg.edit({ embeds: [msgYContent.embed], components: msgYContent.components }).catch(() => {});
            }
        }
    } catch (err) {
        console.error('Erro ao atualizar mensagem de escolha:', err);
    }

    await interaction.followUp({
        content: `**${card.name}** adicionada ao deck! (${deck.length}/3)`,
        ephemeral: true
    }).catch(() => {});

    if (!bothDecksReady(state)) return true;

    state.phase = 'fighting';

    const result = runBattle(state.deckX, state.deckY);
    const winnerUser = result.winner === 'X' ? state.userX : result.winner === 'Y' ? state.userY : null;
    const loserUser = result.winner === 'X' ? state.userY : result.winner === 'Y' ? state.userX : null;

    const placar = `**${result.winsX}** — **${result.winsY}**`;

    const resultEmbed = ui.base(result.winner ? 0xFFD700 : ui.STATUS_COLORS.neutral)
        .setTitle(result.winner ? '⚔️ Fim da batalha' : '⚔️ Empate')
        .setDescription(
            result.winner
                ? `👑 **${winnerUser.username}** venceu ${state.userX.username} ${placar} ${state.userY.username}`
                : `Ninguém levou vantagem — ${state.userX.username} ${placar} ${state.userY.username}`
        );

    const roundLines = result.rounds.map((r) => {
        const venceuX = r.winner === 'A';
        const nomeVencedor = venceuX ? state.userX.username : state.userY.username;
        return `\`R${r.round}\` ${venceuX ? '🟢' : '🔴'} **${ui.cardName(r.cardX)}**  vs  **${ui.cardName(r.cardY)}**\n└ ${nomeVencedor} levou a rodada`;
    }).join('\n');

    resultEmbed.addFields({ name: 'Rodadas', value: roundLines, inline: false });

    if (winnerUser && loserUser) {
        const winnerData = await User.findOne({ id: winnerUser.id });
        const loserData = await User.findOne({ id: loserUser.id });
        if (winnerData) {
            winnerData.balance = (winnerData.balance || 0) + COIN_WINNER;
            winnerData.wins = (winnerData.wins || 0) + 1;
            await winnerData.save();
        }
        if (loserData) {
            loserData.balance = (loserData.balance || 0) + COIN_LOSER;
            loserData.losses = (loserData.losses || 0) + 1;
            await loserData.save();
        }
        resultEmbed.addFields({
            name: '💰 Recompensas',
            value: `👑 ${winnerUser.username} — ${ui.coins(COIN_WINNER)}\n🥈 ${loserUser.username} — ${ui.coins(COIN_LOSER)}`,
            inline: false
        });
    }

    const challengeChannel = await client.channels.fetch(state.challengeChannelId).catch(() => null);
    if (challengeChannel) {
        await challengeChannel.send({
            content: `${state.userX} vs ${state.userY}`,
            embeds: [resultEmbed]
        }).catch(() => {});
    }

    try {
        const dmWinner = result.winner ? (result.winner === 'X' ? state.userX : state.userY) : null;
        const dmLoser = result.winner ? (result.winner === 'X' ? state.userY : state.userX) : null;
        if (dmWinner) await dmWinner.send({ embeds: [resultEmbed] }).catch(() => {});
        if (dmLoser && dmLoser.id !== dmWinner?.id) await dmLoser.send({ embeds: [resultEmbed] }).catch(() => {});
        if (!result.winner) {
            await state.userX.send({ embeds: [resultEmbed] }).catch(() => {});
            await state.userY.send({ embeds: [resultEmbed] }).catch(() => {});
        }
    } catch (e) {
        // ignore DM errors
    }

    finishBattle(effectiveBattleId);
    return true;
}

module.exports = { handleBattlePick };
