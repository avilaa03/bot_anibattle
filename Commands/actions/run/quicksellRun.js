const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function getValueToSell(card) {
    return card.valueToSell ?? (card.marketValue != null ? Math.floor(card.marketValue / 2) : 0);
}

function updateEmbed(card) {
    const value = getValueToSell(card);
    const embed = new EmbedBuilder()
        .setTitle('AniBattle — Venda rápida')
        .addFields(
            { name: 'Nome', value: card.name ? card.name.charAt(0).toUpperCase() + card.name.slice(1) : '—', inline: true },
            { name: 'Raridade', value: card.rarity || '—', inline: true },
            { name: 'Valor de venda', value: `${value} moedas`, inline: true }
        );
    if (card.characterImage) embed.setImage(card.characterImage);
    else if (card.baseImage) embed.setImage(card.baseImage);
    return embed;
}

function buildConfirmationRow(card) {
    const value = getValueToSell(card);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_sell').setLabel(`Vender por ${value} moedas`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cancel_sell').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    );
}

async function quicksellRun(client, interaction, user, matchingCards) {
    const indexRef = { currentIndex: 0 };

    const rowNavigation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('Anterior').setStyle(ButtonStyle.Primary).setDisabled(matchingCards.length === 1),
            new ButtonBuilder().setCustomId('next').setLabel('Próximo').setStyle(ButtonStyle.Primary).setDisabled(matchingCards.length === 1)
        );

    const message = await interaction.reply({
        embeds: [updateEmbed(matchingCards[0])],
        components: [rowNavigation, buildConfirmationRow(matchingCards[0])],
        fetchReply: true
    });

    return { message, indexRef, rowNavigation };
}

module.exports = { quicksellRun, updateEmbed, buildConfirmationRow, getValueToSell };
