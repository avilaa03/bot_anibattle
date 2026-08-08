const ui = require('../../utils/embeds');

// NÃO marcar como async: quem chama usa o retorno como coletor
// (`collector.on(...)`). Se a função for async ela devolve uma Promise
// e a chamada quebra com "collector.on is not a function".
module.exports = (interaction, message, indexRef, matchingCards, user, favCardEnd, updateEmbed, createRow, t) => {
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
            const escolhida = matchingCards[indexRef.currentIndex];
            user.favCard = escolhida.cardId;
            await user.save();
            const embed = ui.success(t('favcard.definida'), t('favcard.definida_texto', {
                emoji: ui.getRarity(escolhida.rarity, t.locale).emoji,
                carta: ui.cardName(escolhida.name, t.locale)
            }));
            if (escolhida.characterImage) embed.setThumbnail(escolhida.characterImage);
            await i.update({ embeds: [embed], components: [] });
            collector.stop('collected');
        } else if (i.customId === 'cancel') {
            await i.update({ embeds: [ui.neutral(t('undosell.cancelado'), t('favcard.cancelado_texto'))], components: [] });
            collector.stop('collected');
        }
    });

    collector.on('end', (collected, reason) => {
        favCardEnd(message, reason);
    });

    return collector;
};
