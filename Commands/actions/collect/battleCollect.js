const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { createBattle } = require('../../utils/battleState');

const MAX_CARDS_SHOWN = 25;
const CARDS_PER_ROW = 5;

function buildDeckChoiceMessage(battleId, side, inventory, selectedIndices, deck) {
    const embed = new EmbedBuilder()
        .setTitle('⚔️ Escolha 3 cartas para a batalha')
        .setDescription(
            deck.length < 3
                ? `Clique em **3 cartas** abaixo (${deck.length}/3 escolhidas).`
                : '✅ **Deck completo!** Aguardando seu oponente...'
        )
        .setColor(deck.length === 3 ? '#00FF00' : '#FFA500');

    if (deck.length > 0) {
        embed.addFields({
            name: 'Suas cartas escolhidas',
            value: deck.map((c, i) => `${i + 1}. ${c.name}`).join('\n')
        });
    }

    const cardsToShow = inventory.slice(0, MAX_CARDS_SHOWN);
    const rows = [];

    for (let row = 0; row < Math.ceil(cardsToShow.length / CARDS_PER_ROW); row++) {
        const actionRow = new ActionRowBuilder();
        for (let col = 0; col < CARDS_PER_ROW; col++) {
            const index = row * CARDS_PER_ROW + col;
            if (index >= cardsToShow.length) break;
            const card = cardsToShow[index];
            const isSelected = selectedIndices.has(index);
            const label = card.name.length > 80 ? card.name.slice(0, 77) + '...' : card.name;
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`battle_pick_${battleId}_${side}_${index}`)
                    .setLabel(isSelected ? `✓ ${label.slice(0, 76)}` : label)
                    .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Primary)
                    .setDisabled(isSelected)
            );
        }
        rows.push(actionRow);
    }

    return { embed, components: rows };
}

async function battleCollect(interaction, userX, userY, userXData, userYData, challengeMessage) {
    const filter = (i) => i.customId === 'accept_battle' && i.user.id === userY.id;
    const collector = challengeMessage.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async (i) => {
        await i.update({
            content: `${userY.username} aceitou o desafio! Escolham **3 cartas** cada um no privado.`,
            components: []
        });

        const battleId = challengeMessage.id;
        const state = createBattle(
            battleId,
            userX,
            userY,
            userXData,
            userYData,
            interaction.channelId
        );

        const invX = userXData.inventory;
        const invY = userYData.inventory;

        const msgXContent = buildDeckChoiceMessage(battleId, 'X', invX, state.selectedIndicesX, state.deckX);
        const msgYContent = buildDeckChoiceMessage(battleId, 'Y', invY, state.selectedIndicesY, state.deckY);

        try {
            const msgX = await userX.send({
                content: `Você está batalhando contra **${userY.username}**!`,
                embeds: [msgXContent.embed],
                components: msgXContent.components
            });
            state.messageXId = msgX.id;
            state.channelXId = msgX.channel.id;

            const msgY = await userY.send({
                content: `Você está batalhando contra **${userX.username}**!`,
                embeds: [msgYContent.embed],
                components: msgYContent.components
            });
            state.messageYId = msgY.id;
            state.channelYId = msgY.channel.id;
        } catch (err) {
            console.error('Erro ao enviar DM da batalha:', err);
            await interaction.followUp({
                content: 'Não foi possível enviar a mensagem no privado. Peça ao oponente para habilitar DMs do servidor.',
                ephemeral: true
            }).catch(() => {});
        }
    });

    return collector;
}

module.exports = { battleCollect, buildDeckChoiceMessage };
