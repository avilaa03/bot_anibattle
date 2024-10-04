module.exports = async (interaction, embedMessage, currentPage, user, generateEmbed, generateButtons, inventoryEnd) => {
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
            components: [generateButtons(currentPage)]
        });
    });

    collector.on('end', () => {
        inventoryEnd(embedMessage);
    });

    return collector;
};
