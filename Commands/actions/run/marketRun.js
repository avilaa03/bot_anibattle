const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Market = require('../../utils/marketSchema.js');
const { escapeRegex } = require('../../utils/regexUtils.js');
const ui = require('../../utils/embeds.js');
const valores = require('../../utils/cardValues.js');
const { buildSelectMenu } = require('../collect/marketCollect.js');
const { tDaInteracao } = require('../../utils/language');

module.exports = async (client, interaction, marketCollect, marketEnd) => {
    const t = await tDaInteracao(interaction);

    const cardName = interaction.options.getString('cardname') || '';
    const minValue = interaction.options.getInteger('minvalue') || 0;
    const maxValue = interaction.options.getInteger('maxvalue') || Number.MAX_VALUE;
    const rarity = interaction.options.getString('rarity') || '';

    const query = {
        cardName: new RegExp(escapeRegex(cardName), 'i'),
        listingPrice: { $gte: minValue, $lte: maxValue },
        status: 'available'
    };

    if (rarity) {
        query.rarity = new RegExp(`^${escapeRegex(rarity)}$`, 'i');
    }
    const series = interaction.options.getString('series') || '';
    if (series) {
        query.series = new RegExp(escapeRegex(series), 'i');
    }

    const listings = await Market.find(query).lean();

    if (listings.length === 0) {
        const embed = ui.neutral(t('market.titulo_curto'), t('market.vazio'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    let currentPage = 0;
    const cardsPerPage = 9;
    const totalPages = Math.ceil(listings.length / cardsPerPage);

    const generateEmbed = (page) => {
        const start = page * cardsPerPage;
        const pageCards = listings.slice(start, start + cardsPerPage);

        const lista = pageCards.map((listing, index) => {
            const meta = ui.getRarity(listing.rarity, t.locale);
            const ovr = valores.overallDaCarta(listing);
            return `\`${index + 1}\` ${meta.emoji} **${ui.cardName(listing)}** — ${t('atributos.ovr')} **${ovr}**\n`
                + `└ ${listing.series || t('comum.traco')} • ${ui.coins(listing.listingPrice, t.locale)}`
                + ` • ${t('market.vendedor')} <@${listing.sellerId}>`;
        }).join('\n');

        return ui.base(ui.STATUS_COLORS.info)
            .setTitle(t('market.titulo'))
            .setDescription(`${lista}\n\n${t('market.dica_menu')}`)
            .setFooter({
                text: `${ui.BRAND} • ${t('comum.pagina', { atual: page + 1, total: totalPages })}`
                    + ` • ${t('market.anuncios', { n: listings.length })}`
            });
    };

    const generateButtons = (page) => {
        const navegacao = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('previous_page')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 0),
            new ButtonBuilder()
                .setCustomId('page_indicator')
                .setLabel(`${page + 1} / ${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('next_page')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        );

        // O menu de seleção substituiu o "digite o número no chat".
        return [buildSelectMenu(listings, page, cardsPerPage, t), navegacao];
    };

    const embedMessage = await interaction.editReply({
        embeds: [generateEmbed(currentPage)],
        components: generateButtons(currentPage)
    });

    marketCollect(interaction, embedMessage, currentPage, listings, cardsPerPage, marketEnd, generateEmbed, generateButtons, t);
};
