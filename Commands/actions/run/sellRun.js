const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const User = require('../../utils/userSchema');
const { sellCollect } = require('../collect/sellCollect.js');
const { sellEnd } = require('../end/sellEnd.js');
const CardBuilder = require('../../utils/cardBuilder.js');

async function buildSellEmbed(card, listingPrice) {
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
    const cardBuilder = new CardBuilder(cardData);
    const cardImageBuffer = await cardBuilder.build();
    const attachment = new AttachmentBuilder(cardImageBuffer, { name: 'cardImage.png' });

    const embed = new EmbedBuilder()
        .setTitle('AniBattle — Vender no mercado')
        .addFields(
            { name: 'Nome', value: card.name ? card.name.charAt(0).toUpperCase() + card.name.slice(1) : '—', inline: true },
            { name: 'Raridade', value: card.rarity || '—', inline: true },
            { name: 'Valor de Venda', value: `${listingPrice} moedas`, inline: true }
        )
        .setImage('attachment://cardImage.png');

    return { embed, attachment };
}

async function sellRun(client, interaction) {
    const cardName = interaction.options.getString('cardname');
    const listingPrice = interaction.options.getInteger('price');

    const user = await User.findOne({ id: interaction.user.id });
    if (!user) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Erro')
            .setDescription('Usuário não encontrado.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const matchingCards = user.inventory.filter(card => card.name.toLowerCase().includes(cardName.toLowerCase()));

    if (matchingCards.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Carta não encontrada')
            .setDescription('Nenhuma carta no seu inventário corresponde a esse nome.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply();

    let indexRef = { currentIndex: 0 };

    let embed, attachment;
    try {
        const result = await Promise.race([
            buildSellEmbed(matchingCards[indexRef.currentIndex], listingPrice),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 12000))
        ]);
        embed = result.embed;
        attachment = result.attachment;
    } catch (err) {
        const errEmbed = new EmbedBuilder()
            .setTitle('❌ Erro ao gerar a carta')
            .setDescription(err.message === 'TIMEOUT' ? 'A imagem demorou demais. Tente novamente.' : 'Não foi possível exibir a carta. Tente novamente.')
            .setColor('#E53935');
        return interaction.editReply({ embeds: [errEmbed] });
    }

    const rowNavigation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('Anterior')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(matchingCards.length === 1),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Próximo')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(matchingCards.length === 1)
        );

    const rowConfirmation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_sell')
                .setLabel(`Vender por ${listingPrice} moedas`)
                .setStyle(ButtonStyle.Primary),
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

    await sellCollect(interaction, collector, matchingCards, indexRef, listingPrice, user, rowNavigation, rowConfirmation, buildSellEmbed);
    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            await sellEnd(interaction);
        }
    });
}

module.exports = sellRun;
module.exports.buildSellEmbed = buildSellEmbed;
