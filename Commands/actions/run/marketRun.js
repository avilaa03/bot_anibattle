const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Market = require('../../utils/marketSchema.js');

module.exports = async (client, interaction, marketCollect, marketEnd) => {
    const cardName = interaction.options.getString('cardname') || '';
    const minValue = interaction.options.getInteger('minvalue') || 0;
    const maxValue = interaction.options.getInteger('maxvalue') || Number.MAX_VALUE;
    const rarity = interaction.options.getString('rarity') || '';

    const query = {
        cardName: new RegExp(cardName, 'i'),
        listingPrice: { $gte: minValue, $lte: maxValue },
        status: 'available'
    };

    if (rarity) {
        query.rarity = rarity;
    }

    const listings = await Market.find(query);

    if (listings.length === 0) {
        return interaction.reply({ content: 'Nenhuma carta encontrada.', ephemeral: true });
    }

    let currentPage = 0;
    const cardsPerPage = 9;

    const generateEmbed = (page) => {
        const start = page * cardsPerPage;
        const end = start + cardsPerPage;
        const pageCards = listings.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle('Cartas Disponíveis no Mercado')
            .setDescription(`Página ${page + 1} de ${Math.ceil(listings.length / cardsPerPage)}`)
            .setColor(0x0099FF);

        pageCards.forEach((listing, index) => {
            embed.addFields({ name: `${index + 1}. ${listing.cardName}`, value: `Preço: ${listing.listingPrice}`, inline: false });
        });

        return embed;
    };

    const generateButtons = (page) => {
        const buttons = new ActionRowBuilder();

        if (page > 0) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId('previous_page')
                    .setLabel('Anterior')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        if (page < Math.ceil(listings.length / cardsPerPage) - 1) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Próximo')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        return buttons.components.length > 0 ? [buttons] : [];
    };

    const embedMessage = await interaction.reply({
        embeds: [generateEmbed(currentPage)],
        components: generateButtons(currentPage),
        fetchReply: true
    });

    marketCollect(interaction, embedMessage, currentPage, listings, cardsPerPage, marketEnd);
};
