async function showCollect(interaction, collector, matchingCards, indexRef, updateEmbed, row) {
    collector.on('collect', async (i) => {
        if (i.customId === 'prev') {
            indexRef.currentIndex = (indexRef.currentIndex - 1 + matchingCards.length) % matchingCards.length;
        } else if (i.customId === 'next') {
            indexRef.currentIndex = (indexRef.currentIndex + 1) % matchingCards.length;
        }

        const result = await updateEmbed(indexRef.currentIndex, matchingCards, true);
        const payload = { embeds: [result.embed], components: [row] };
        if (result.attachment) payload.files = [result.attachment];

        await i.update(payload);
    });
}

module.exports = { showCollect };
