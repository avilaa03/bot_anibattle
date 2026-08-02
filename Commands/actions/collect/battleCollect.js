const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createBattle, generateBattleId } = require('../../utils/battleState');
const ui = require('../../utils/embeds');

const MAX_CARDS_SHOWN = 25;
const CARDS_PER_ROW = 5;

function buildDeckChoiceMessage(battleId, side, inventory, selectedIndices, deck) {
    const completo = deck.length === 3;

    const embed = ui.base(completo ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.warning)
        .setTitle('⚔️ Monte seu time')
        .setDescription(
            completo
                ? '✅ **Time completo!** Aguardando seu oponente escolher...'
                : `Escolha **3 cartas** para batalhar.\n\n${'🔵'.repeat(deck.length)}${'⚪'.repeat(3 - deck.length)}  **${deck.length}/3**\n\n💡 *A ordem importa: sua 1ª carta enfrenta a 1ª do oponente, e assim por diante.*`
        );

    if (deck.length > 0) {
        embed.addFields({
            name: 'Seu time',
            value: deck.map((c, i) => {
                const meta = ui.getRarity(c.rarity);
                return `\`${i + 1}\` ${meta.emoji} **${ui.cardName(c.name)}** — OVR ${c.overall ?? 0}\n└ ⚔️ ${c.ATA ?? 0} · ❤️ ${c.LIF ?? 0} · 💥 ${c.POW ?? 0}`;
            }).join('\n')
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
            const meta = ui.getRarity(card.rarity);
            // O OVR no rótulo deixa a escolha estratégica sem precisar
            // abrir o inventário em outra janela.
            const nomeCurto = card.name.length > 60 ? card.name.slice(0, 57) + '…' : card.name;
            const label = `${nomeCurto} · ${card.overall ?? 0}`;
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`battle_pick_${battleId}_${side}_${index}`)
                    .setLabel(label.slice(0, 80))
                    .setEmoji(meta.emoji)
                    .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
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

        const battleId = generateBattleId();
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
