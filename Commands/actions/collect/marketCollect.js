const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../../utils/userSchema');

module.exports = async (interaction, embedMessage, currentPage, listings, cardsPerPage, marketEnd) => {
    const filter = (i) => ['previous_page', 'next_page'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = embedMessage.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (i) => {
        if (i.customId === 'previous_page') {
            currentPage--;
        } else if (i.customId === 'next_page') {
            currentPage++;
        }

        await i.update({
            embeds: [generateEmbed(currentPage)],
            components: generateButtons(currentPage)
        });
    });

    collector.on('end', () => {
        marketEnd(embedMessage);
    });

    const numberFilter = (response) => {
        const choice = parseInt(response.content);
        return !isNaN(choice) && choice > 0 && choice <= Math.min(cardsPerPage, listings.length - currentPage * cardsPerPage) && response.author.id === interaction.user.id;
    };

    const numberCollector = interaction.channel.createMessageCollector({ filter: numberFilter, time: 60000 });

    numberCollector.on('collect', async (response) => {
        const choice = parseInt(response.content);
        const selectedCard = listings[currentPage * cardsPerPage + choice - 1];

        const confirmEmbed = new EmbedBuilder()
            .setTitle('Confirmar Compra')
            .setDescription(`Você quer comprar a carta **${selectedCard.cardName}** por **${selectedCard.listingPrice}** moedas?`)
            .setColor(0x00FF00);

        const confirmButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_buy')
                    .setLabel('Confirmar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_buy')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Danger)
            );

        const confirmMessage = await response.reply({ embeds: [confirmEmbed], components: [confirmButtons], fetchReply: true });

        // Chamar o método para lidar com a confirmação da compra
        marketEnd(confirmMessage, selectedCard, interaction);
    });

    numberCollector.on('end', () => {
        marketEnd(embedMessage);
    });
};
