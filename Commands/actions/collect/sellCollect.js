const Market = require('../../utils/marketSchema');

async function sellCollect(interaction, collector, matchingCards, currentIndex, listingPrice, user, rowNavigation, rowConfirmation) {
    collector.on('collect', async (i) => {
        if (i.customId === 'prev') {
            currentIndex = (currentIndex - 1 + matchingCards.length) % matchingCards.length;
            await i.update({ embeds: [updateEmbed(matchingCards, currentIndex, listingPrice)], components: [rowNavigation, rowConfirmation] });
        } else if (i.customId === 'next') {
            currentIndex = (currentIndex + 1) % matchingCards.length;
            await i.update({ embeds: [updateEmbed(matchingCards, currentIndex, listingPrice)], components: [rowNavigation, rowConfirmation] });
        } else if (i.customId === 'confirm_sell') {
            const card = matchingCards[currentIndex];
            user.inventory = user.inventory.filter(c => c._id.toString() !== card._id.toString());

            const listing = new Market({
                cardId: card._id,
                sellerId: interaction.user.id,
                cardName: card.name,
                series: card.series,
                seriesImage: card.seriesImage,
                baseImage: card.baseImage,
                characterImage: card.characterImage,
                rarity: card.rarity,
                overall: card.overall,
                ATA: card.ATA,
                LIF: card.LIF,
                POW: card.POW,
                obtainedAt: card.obtainedAt,
                marketValue: card.marketValue,
                listingPrice: listingPrice,
                status: 'available'
            });

            await listing.save();
            await user.save();

            await i.update({ content: `Carta listada no mercado por ${listingPrice} moedas.`, embeds: [], components: [] });
            collector.stop('collected');
        } else if (i.customId === 'cancel_sell') {
            await i.update({ content: 'Venda cancelada.', embeds: [], components: [] });
            collector.stop('collected');
        }
    });
}

module.exports = { sellCollect };
