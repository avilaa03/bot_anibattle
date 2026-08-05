const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds');
const valores = require('../../utils/valores');
const { applyMarketTax, MARKET_TAX_RATE } = require('../../utils/economy');
const User = require('../../utils/userSchema');
const { sellCollect } = require('../collect/sellCollect.js');
const { sellEnd } = require('../end/sellEnd.js');
const { renderCard } = require('../../utils/cardRenderer.js');
const { molduraEfetiva } = require('../../utils/vip');

async function buildSellEmbed(card, listingPrice, moldura = 'nenhuma') {
    // Copiar campos explicitamente do subdocument (como no /show), sem spread que perde characterImage/baseImage
    const cardData = {
        name: card.name,
        series: card.series,
        seriesImage: card.seriesImage,
        baseImage: card.baseImage,
        characterImage: card.characterImage,
        rarity: card.rarity,
        overall: valores.overallDaCarta(card),
        ATA: card.ATA ?? 0,
        LIF: card.LIF ?? 0,
        POW: card.POW ?? 0
    };
    const render = await renderCard(cardData, { moldura });
    const attachment = render.attachment;

    const meta = ui.getRarity(card.rarity);
    const embed = ui.base(meta.color)
        .setTitle(`🏪 Anunciar ${ui.cardName(card.name)}${ui.nivelTag(card.nivel)}`)
        .setDescription([
            `${meta.emoji} ${ui.rarityTag(card.rarity)} • *${card.series || '—'}*`,
            '',
            ui.statLines(card),
            '',
            `Preço do anúncio: ${ui.coins(listingPrice)}`,
            `Você recebe: ${ui.coins(applyMarketTax(listingPrice).sellerReceives)} *(taxa de ${Math.round(MARKET_TAX_RATE * 100)}%)*`
        ].join('\n'))
        .setImage(render.url);

    return { embed, attachment };
}

async function sellRun(client, interaction) {
    const cardName = interaction.options.getString('cardname');
    const listingPrice = interaction.options.getInteger('price');

    const user = await User.findOne({ id: interaction.user.id });
    if (!user) {
        const embed = ui.error('Perfil não encontrado', 'Use `/roll` ou `/daily` para criar seu perfil primeiro.');
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    const matchingCards = user.inventory.filter(card => card.name.toLowerCase().includes(cardName.toLowerCase()));

    if (matchingCards.length === 0) {
        const embed = ui.error('Carta não encontrada', `Nenhuma carta no seu inventário tem "${cardName}" no nome.`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    let indexRef = { currentIndex: 0 };
    const moldura = molduraEfetiva(user);
    const montarEmbed = (card, preco) => buildSellEmbed(card, preco, moldura);

    let embed, attachment;
    try {
        const result = await Promise.race([
            montarEmbed(matchingCards[indexRef.currentIndex], listingPrice),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 12000))
        ]);
        embed = result.embed;
        attachment = result.attachment;
    } catch (err) {
        const errEmbed = ui.error('Erro ao gerar a carta', err.message === 'TIMEOUT' ? 'A imagem demorou demais para carregar. Tente novamente.' : 'Não foi possível exibir a carta. Tente novamente.');
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
                .setLabel(`Anunciar por ${ui.number(listingPrice)}`)
                .setEmoji('🏪')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('cancel_sell')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

    const message = await interaction.editReply({
        embeds: [embed],
        components: [rowNavigation, rowConfirmation],
        files: [attachment]
    });

    const filter = i => ['prev', 'next', 'confirm_sell', 'cancel_sell'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 30000 });

    await sellCollect(interaction, collector, matchingCards, indexRef, listingPrice, user, rowNavigation, rowConfirmation, montarEmbed);
    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            await sellEnd(interaction);
        }
    });
}

module.exports = sellRun;
module.exports.buildSellEmbed = buildSellEmbed;
