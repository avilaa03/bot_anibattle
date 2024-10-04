const { ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');

async function battleCollect(interaction, userX, userY, userXData, userYData, challengeMessage) {
    const filter = (i) => i.customId === 'accept_battle' && i.user.id === userY.id;
    const collector = challengeMessage.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async (i) => {
        await i.update({
            content: `${userY.username} aceitou o desafio! Escolham suas cartas no privado!`,
            components: []
        });

        const selectCardEmbed = new EmbedBuilder()
            .setTitle('Escolha 3 Cartas do seu inventário para a Batalha!')
            .setDescription('Selecione as cartas que deseja utilizar para essa batalha')
            .setColor('#00FF00');

        const cardButtonsX = new ActionRowBuilder();
        const cardButtonsY = new ActionRowBuilder();

        userXData.inventory.slice(0, 3).forEach((card, index) => {
            cardButtonsX.addComponents(
                new ButtonBuilder()
                    .setCustomId(`cardX_${index}`)
                    .setLabel(card.name)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        userYData.inventory.slice(0, 3).forEach((card, index) => {
            cardButtonsY.addComponents(
                new ButtonBuilder()
                    .setCustomId(`cardY_${index}`)
                    .setLabel(card.name)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        await userX.send({
            content: 'Escolha suas cartas!',
            embeds: [selectCardEmbed],
            components: [cardButtonsX]
        });

        await userY.send({
            content: 'Escolha suas cartas!',
            embeds: [selectCardEmbed],
            components: [cardButtonsY]
        });
    });

    return collector;
}

module.exports = { battleCollect };
