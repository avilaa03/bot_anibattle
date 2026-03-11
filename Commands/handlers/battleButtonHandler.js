const { EmbedBuilder } = require('discord.js');
const User = require('../utils/userSchema');
const { getBattle, addCardToDeck, bothDecksReady, finishBattle, COIN_WINNER, COIN_LOSER } = require('../utils/battleState');
const { runBattle } = require('../utils/battleEngine');
const { buildDeckChoiceMessage } = require('../actions/collect/battleCollect');

/**
 * customId: battle_pick_<battleId>_<X|Y>_<index>
 */
async function handleBattlePick(client, interaction) {
    const parts = interaction.customId.split('_');
    if (parts.length < 5) return false;
    const battleId = parts[2];
    const side = parts[3];
    const index = parseInt(parts[4], 10);

    const state = getBattle(battleId);
    if (!state) {
        await interaction.reply({ content: 'Esta batalha expirou ou já foi concluída.', ephemeral: true }).catch(() => {});
        return true;
    }

    const isX = side === 'X';
    const userId = interaction.user.id;
    if (isX && state.userX.id !== userId) return false;
    if (!isX && state.userY.id !== userId) return false;

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

    const card = inventory[index];
    addCardToDeck(battleId, side, card);
    selectedIndices.add(index);

    const invX = state.userXData.inventory;
    const invY = state.userYData.inventory;
    const msgXContent = buildDeckChoiceMessage(battleId, 'X', invX, state.selectedIndicesX, state.deckX);
    const msgYContent = buildDeckChoiceMessage(battleId, 'Y', invY, state.selectedIndicesY, state.deckY);

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

    await interaction.reply({
        content: `**${card.name}** adicionada ao deck! (${deck.length}/3)`,
        ephemeral: true
    }).catch(() => {});

    if (!bothDecksReady(state)) return true;

    state.phase = 'fighting';

    const result = runBattle(state.deckX, state.deckY);
    const winnerUser = result.winner === 'X' ? state.userX : result.winner === 'Y' ? state.userY : null;
    const loserUser = result.winner === 'X' ? state.userY : result.winner === 'Y' ? state.userX : null;

    const resultEmbed = new EmbedBuilder()
        .setTitle(result.winner ? '⚔️ Batalha encerrada!' : '⚔️ Empate!')
        .setColor(result.winner ? '#FFD700' : '#808080')
        .setDescription(
            result.winner
                ? `**${winnerUser.username}** venceu por **${result.winner === 'X' ? result.winsX : result.winsY}** a **${result.winner === 'X' ? result.winsY : result.winsX}**!`
                : `Ninguém levou vantagem. **${result.winsX}** x **${result.winsY}**.`
        );

    const roundFields = result.rounds.map((r, i) => ({
        name: `Rodada ${r.round}`,
        value: `${r.cardX} vs ${r.cardY} → **${r.winner === 'A' ? state.userX.username : state.userY.username}** venceu.`
    }));
    resultEmbed.addFields(roundFields);

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
        resultEmbed.addFields(
            { name: '💰 Recompensas', value: `${winnerUser.username}: +${COIN_WINNER} moedas\n${loserUser.username}: +${COIN_LOSER} moedas`, inline: false }
        );
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

    finishBattle(battleId);
    return true;
}

module.exports = { handleBattlePick };
