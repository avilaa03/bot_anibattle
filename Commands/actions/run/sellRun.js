const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds');
const { applyMarketTax, MARKET_TAX_RATE } = require('../../utils/economy');
const User = require('../../utils/userSchema');
const { sellCollect } = require('../collect/sellCollect.js');
const { sellEnd } = require('../end/sellEnd.js');
const { renderCard } = require('../../utils/cardRenderer.js');
const { molduraEfetiva } = require('../../utils/vip');
const { tDaInteracao } = require('../../utils/idioma');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

async function buildSellEmbed(card, listingPrice, moldura = 'nenhuma', t = criarT(DEFAULT_LOCALE)) {
    // Copiar campos explicitamente do subdocument (como no /show), sem spread que perde characterImage/baseImage
    const cardData = {
        name: card.name,
        series: card.series,
        seriesImage: card.seriesImage,
        baseImage: card.baseImage,
        characterImage: card.characterImage,
        rarity: card.rarity,
        overall: card.overall ?? (card.marketValue != null ? Math.round(card.marketValue / 10) : 0),
        ATA: card.ATA ?? 0,
        LIF: card.LIF ?? 0,
        POW: card.POW ?? 0
    };
    const render = await renderCard(cardData, { moldura, locale: t.locale });
    const attachment = render.attachment;

    const meta = ui.getRarity(card.rarity, t.locale);
    const embed = ui.base(meta.color)
        .setTitle(t('sell.titulo', { carta: ui.cardName(card.name, t.locale) }))
        .setDescription([
            `${meta.emoji} ${ui.rarityTag(card.rarity, t.locale)} • *${card.series || t('comum.traco')}*`,
            '',
            ui.statLines(card, t.locale),
            '',
            t('sell.preco_anuncio', { valor: ui.coins(listingPrice, t.locale) }),
            t('sell.voce_recebe', {
                valor: ui.coins(applyMarketTax(listingPrice).sellerReceives, t.locale),
                porcento: Math.round(MARKET_TAX_RATE * 100)
            })
        ].join('\n'))
        .setImage(render.url);

    return { embed, attachment };
}

async function sellRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const cardName = interaction.options.getString('cardname');
    const listingPrice = interaction.options.getInteger('price');

    const user = await User.findOne({ id: interaction.user.id });
    if (!user) {
        const embed = ui.error(t('comum.perfil_nao_encontrado'), t('comum.perfil_nao_encontrado_texto'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    const matchingCards = user.inventory.filter(card => card.name.toLowerCase().includes(cardName.toLowerCase()));

    if (matchingCards.length === 0) {
        const embed = ui.error(t('comum.carta_nao_encontrada'), t('quicksell.nenhuma_com_nome', { nome: cardName }));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    let indexRef = { currentIndex: 0 };
    const moldura = molduraEfetiva(user);
    const montarEmbed = (card, preco) => buildSellEmbed(card, preco, moldura, t);

    let embed, attachment;
    try {
        const result = await Promise.race([
            montarEmbed(matchingCards[indexRef.currentIndex], listingPrice),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 12000))
        ]);
        embed = result.embed;
        attachment = result.attachment;
    } catch (err) {
        const errEmbed = ui.error(
            t('sell.erro_render'),
            t(err.message === 'TIMEOUT' ? 'sell.erro_timeout' : 'sell.erro_exibir')
        );
        return interaction.editReply({ embeds: [errEmbed] });
    }

    const rowNavigation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(matchingCards.length === 1),
            new ButtonBuilder()
                .setCustomId('next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(matchingCards.length === 1)
        );

    const rowConfirmation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_sell')
                .setLabel(t('sell.botao_anunciar', { valor: ui.number(listingPrice, t.locale) }))
                .setEmoji('🏪')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('cancel_sell')
                .setLabel(t('comum.cancelar'))
                .setStyle(ButtonStyle.Secondary)
        );

    const message = await interaction.editReply({
        embeds: [embed],
        components: [rowNavigation, rowConfirmation],
        files: [attachment]
    });

    const filter = i => ['prev', 'next', 'confirm_sell', 'cancel_sell'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 30000 });

    await sellCollect(interaction, collector, matchingCards, indexRef, listingPrice, user, rowNavigation, rowConfirmation, montarEmbed, t);
    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            await sellEnd(interaction, t);
        }
    });
}

module.exports = sellRun;
module.exports.buildSellEmbed = buildSellEmbed;
