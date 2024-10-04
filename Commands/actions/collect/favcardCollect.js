module.exports = async (interaction, message, currentIndex, matchingCards, user, favCardEnd) => {
    const filter = i => ['prev', 'next', 'fav', 'cancel'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'prev') {
            currentIndex = (currentIndex - 1 + matchingCards.length) % matchingCards.length;
            await i.update({ embeds: [updateEmbed()], components: [createRow()] });
        } else if (i.customId === 'next') {
            currentIndex = (currentIndex + 1) % matchingCards.length;
            await i.update({ embeds: [updateEmbed()], components: [createRow()] });
        } else if (i.customId === 'fav') {
            user.favCard = matchingCards[currentIndex].cardId;
            await user.save();
            await i.update({ content: `A carta **${matchingCards[currentIndex].name}** foi adicionada como favorita!`, embeds: [], components: [] });
            collector.stop('collected');
        } else if (i.customId === 'cancel') {
            await i.update({ content: 'Operação cancelada.', embeds: [], components: [] });
            collector.stop('collected');
        }
    });

    collector.on('end', (collected, reason) => {
        favCardEnd(message, reason);
    });

    return collector;
};
