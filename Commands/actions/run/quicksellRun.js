const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function updateEmbed(card) {
    const embed = new EmbedBuilder()
        .setTitle('AniBattle')
        .setImage(card.image)
        .addFields(
            { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
            { name: "Raridade", value: card.rarity },
            { name: "Valor de Venda", value: `${card.valueToSell} moedas` }
        );
    return embed;
}

async function quicksellRun(client, interaction, user, matchingCards) {
    let currentIndex = 0;

    const rowNavigation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('Anterior').setStyle(ButtonStyle.Primary).setDisabled(matchingCards.length === 1),
            new ButtonBuilder().setCustomId('next').setLabel('Próximo').setStyle(ButtonStyle.Primary).setDisabled(matchingCards.length === 1)
        );

    const rowConfirmation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('confirm_sell').setLabel(`Vender por ${matchingCards[currentIndex].valueToSell} moedas`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('cancel_sell').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );

    const message = await interaction.reply({
        embeds: [updateEmbed(matchingCards[currentIndex])],
        components: [rowNavigation, rowConfirmation],
        fetchReply: true
    });

    return { message, currentIndex, rowNavigation, rowConfirmation };
}

module.exports = quicksellRun;
