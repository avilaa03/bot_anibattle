module.exports = async (interaction, message, indexRef, matchingCards, user, favCardEnd, updateEmbed, createRow) => {
    const filter = i => ['prev', 'next', 'fav', 'cancel'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'prev') {
            indexRef.currentIndex = (indexRef.currentIndex - 1 + matchingCards.length) % matchingCards.length;
            const { embed, attachment } = await updateEmbed(indexRef.currentIndex);
            await i.update({ embeds: [embed], components: [createRow()], files: [attachment] });
        } else if (i.customId === 'next') {
            indexRef.currentIndex = (indexRef.currentIndex + 1) % matchingCards.length;
            const { embed, attachment } = await updateEmbed(indexRef.currentIndex);
            await i.update({ embeds: [embed], components: [createRow()], files: [attachment] });
        } else if (i.customId === 'fav') {
            user.favCard = matchingCards[indexRef.currentIndex].cardId;
            await user.save();
            await i.update({ content: `A carta **${matchingCards[indexRef.currentIndex].name}** foi adicionada como favorita!`, embeds: [], components: [] });
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
