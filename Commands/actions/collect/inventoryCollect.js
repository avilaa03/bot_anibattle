module.exports = async (interaction, embedMessage, currentPage, user, generateEmbed, generateButtons, inventoryEnd) => {
    const filter = (i) => ['previous_page', 'next_page'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = embedMessage.createMessageComponentCollector({ filter, time: 60000 });

    const totalPages = Math.ceil(user.inventory.length / 8);

    collector.on('collect', async (i) => {
        if (i.customId === 'previous_page') {
            currentPage = Math.max(0, currentPage - 1);
        } else if (i.customId === 'next_page') {
            currentPage = Math.min(totalPages - 1, currentPage + 1);
        }

        await i.update({
            embeds: [generateEmbed(currentPage)],
            components: [generateButtons(currentPage)]
        });
    });

    collector.on('end', () => {
        inventoryEnd(embedMessage);
    });

    return collector;
};
