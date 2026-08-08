const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');

function getValueToSell(card) {
    return card.valueToSell ?? (card.marketValue != null ? Math.floor(card.marketValue / 2) : 0);
}

function updateEmbed(card, t) {
    const value = getValueToSell(card);
    const meta = ui.getRarity(card.rarity, t.locale);

    const embed = ui.base(meta.color)
        .setTitle(t('quicksell.titulo', { carta: ui.cardName(card.name, t.locale) }))
        .setDescription([
            `${meta.emoji} ${ui.rarityTag(card.rarity, t.locale)} • *${card.series || t('comum.traco')}*`,
            '',
            ui.statLines(card, t.locale),
            '',
            t('quicksell.recebera', { valor: ui.coins(value, t.locale) }),
            t('quicksell.irreversivel')
        ].join('\n'));

    if (card.characterImage) embed.setThumbnail(card.characterImage);
    else if (card.baseImage) embed.setThumbnail(card.baseImage);
    return embed;
}

function buildConfirmationRow(card, t) {
    const value = getValueToSell(card);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_sell').setLabel(t('roll.botao_vender', { valor: ui.number(value, t.locale) })).setEmoji('🪙').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_sell').setLabel(t('comum.cancelar')).setStyle(ButtonStyle.Secondary)
    );
}

async function quicksellRun(client, interaction, user, matchingCards, t) {
    await interaction.deferReply();

    const indexRef = { currentIndex: 0 };

    const rowNavigation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1),
            new ButtonBuilder().setCustomId('next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1)
        );

    const message = await interaction.editReply({
        embeds: [updateEmbed(matchingCards[0], t)],
        components: [rowNavigation, buildConfirmationRow(matchingCards[0], t)]
    });

    return { message, indexRef, rowNavigation };
}

module.exports = { quicksellRun, updateEmbed, buildConfirmationRow, getValueToSell };
