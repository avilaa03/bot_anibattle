const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const valores = require('../../utils/valores');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

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

function updateEmbed(card, t = criarT(DEFAULT_LOCALE)) {
    const value = getValueToSell(card);
    const meta = ui.getRarity(card.rarity, t.locale);

    const embed = ui.base(meta.color)
        .setTitle(t('quicksell.titulo', { carta: ui.cardName(card) }))
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

function buildConfirmationRow(card, t = criarT(DEFAULT_LOCALE)) {
    const value = getValueToSell(card);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_sell').setLabel(t('roll.botao_vender', { valor: ui.number(value, t.locale) })).setEmoji('🪙').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_sell').setLabel(t('comum.cancelar')).setStyle(ButtonStyle.Secondary)
    );
}

async function quicksellRun(client, interaction, user, matchingCards, t = criarT(DEFAULT_LOCALE)) {
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
