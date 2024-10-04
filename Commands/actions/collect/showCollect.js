async function showCollect(interaction, collector, matchingCards, currentIndex, updateEmbed, row) {
    collector.on('collect', async (i) => {
        if (i.customId === 'prev') {
            currentIndex = (currentIndex - 1 + matchingCards.length) % matchingCards.length;
        } else if (i.customId === 'next') {
            currentIndex = (currentIndex + 1) % matchingCards.length;
        }

        await i.update({ embeds: [updateEmbed(currentIndex, matchingCards)], components: [row] });
    });
}

module.exports = { showCollect };
