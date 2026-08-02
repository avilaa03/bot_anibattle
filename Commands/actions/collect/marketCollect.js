const ui = require('../../utils/embeds');

/**
 * Paginação + compra do /market.
 *
 * generateEmbed/generateButtons chegam por parâmetro: antes eles eram
 * usados aqui dentro sem existir neste escopo, o que quebrava os botões
 * de página com ReferenceError no primeiro clique.
 */
module.exports = async (interaction, embedMessage, currentPage, listings, cardsPerPage, marketEnd, generateEmbed, generateButtons) => {
    const totalPages = Math.ceil(listings.length / cardsPerPage);

    const filter = (i) => ['previous_page', 'next_page'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = embedMessage.createMessageComponentCollector({ filter, time: 120000 });

    collector.on('collect', async (i) => {
        if (i.customId === 'previous_page') {
            currentPage = Math.max(0, currentPage - 1);
        } else if (i.customId === 'next_page') {
            currentPage = Math.min(totalPages - 1, currentPage + 1);
        }

        await i.update({
            embeds: [generateEmbed(currentPage)],
            components: generateButtons(currentPage)
        });
    });

    const numberFilter = (response) => {
        if (response.author.id !== interaction.user.id) return false;
        const choice = parseInt(response.content, 10);
        const disponiveisNaPagina = Math.min(cardsPerPage, listings.length - currentPage * cardsPerPage);
        return !isNaN(choice) && choice > 0 && choice <= disponiveisNaPagina;
    };

    const numberCollector = interaction.channel.createMessageCollector({ filter: numberFilter, time: 120000 });

    numberCollector.on('collect', async (response) => {
        const choice = parseInt(response.content, 10);
        const selectedCard = listings[currentPage * cardsPerPage + choice - 1];
        if (!selectedCard) return;

        const meta = ui.getRarity(selectedCard.rarity);
        const ovr = selectedCard.overall ?? (selectedCard.marketValue != null ? Math.round(selectedCard.marketValue / 10) : 0);

        const confirmEmbed = ui.base(meta.color)
            .setTitle('🛒 Confirmar compra')
            .setDescription([
                `${meta.emoji} **${ui.cardName(selectedCard.cardName)}** — OVR **${ovr}**`,
                `*${selectedCard.series || '—'}*`,
                '',
                ui.statLines(selectedCard),
                '',
                `Preço: ${ui.coins(selectedCard.listingPrice)}`
            ].join('\n'));

        if (selectedCard.characterImage) confirmEmbed.setThumbnail(selectedCard.characterImage);

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const confirmButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_buy').setLabel('Comprar').setEmoji('🪙').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_buy').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );

        const confirmMessage = await response.reply({ embeds: [confirmEmbed], components: [confirmButtons], fetchReply: true });

        marketEnd(confirmMessage, selectedCard, interaction);
    });

    collector.on('end', () => {
        numberCollector.stop();
        marketEnd(embedMessage);
    });

    return collector;
};
