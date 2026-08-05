const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const valores = require('../../utils/valores');

/**
 * O quanto a venda rápida paga.
 *
 * Cartas anteriores à migração de valores podem não ter `valueToSell`
 * gravado; nesse caso recalculamos pela raridade em vez de dividir o
 * valor de mercado, que só valia sob a fórmula antiga.
 */
function getValueToSell(card) {
    return card.valueToSell ?? valores.valoresDaCarta(card).valueToSell;
}

function updateEmbed(card) {
    const value = getValueToSell(card);
    const meta = ui.getRarity(card.rarity);

    const embed = ui.base(meta.color)
        .setTitle(`🪙 Vender ${ui.cardName(card)}?`)
        .setDescription([
            `${meta.emoji} ${ui.rarityTag(card.rarity)} • *${card.series || '—'}*`,
            '',
            ui.statLines(card),
            '',
            `Você receberá ${ui.coins(value)} por esta carta.`,
            '⚠️ *Esta ação não pode ser desfeita.*'
        ].join('\n'));

    if (card.characterImage) embed.setThumbnail(card.characterImage);
    else if (card.baseImage) embed.setThumbnail(card.baseImage);
    return embed;
}

function buildConfirmationRow(card) {
    const value = getValueToSell(card);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_sell').setLabel(`Vender por ${ui.number(value)}`).setEmoji('🪙').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_sell').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    );
}

async function quicksellRun(client, interaction, user, matchingCards) {
    await interaction.deferReply();

    const indexRef = { currentIndex: 0 };

    const rowNavigation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1),
            new ButtonBuilder().setCustomId('next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1)
        );

    const message = await interaction.editReply({
        embeds: [updateEmbed(matchingCards[0])],
        components: [rowNavigation, buildConfirmationRow(matchingCards[0])]
    });

    return { message, indexRef, rowNavigation };
}

module.exports = { quicksellRun, updateEmbed, buildConfirmationRow, getValueToSell };
