const User = require('../../utils/userSchema');

module.exports = async (message, selectedCard, interaction) => {
    if (selectedCard) {
        const confirmFilter = (i) => ['confirm_buy', 'cancel_buy'].includes(i.customId) && i.user.id === interaction.user.id;
        const confirmCollector = message.createMessageComponentCollector({ filter: confirmFilter, time: 60000 });

        confirmCollector.on('collect', async (i) => {
            if (i.customId === 'confirm_buy') {
                const buyer = await User.findOne({ id: interaction.user.id });
                const seller = await User.findOne({ id: selectedCard.sellerId });

                if (buyer.balance < selectedCard.listingPrice) {
                    return i.update({ content: 'Você não tem dinheiro suficiente para comprar esta carta.', embeds: [], components: [], ephemeral: true });
                }

                buyer.balance -= selectedCard.listingPrice;
                seller.balance += selectedCard.listingPrice;

                const cardToAdd = {
                    cardId: selectedCard.cardId,
                    originalCardId: selectedCard.cardId,
                    name: selectedCard.cardName,
                    series: selectedCard.series,
                    seriesImage: selectedCard.seriesImage,
                    baseImage: selectedCard.baseImage,
                    characterImage: selectedCard.characterImage,
                    rarity: selectedCard.rarity,
                    overall: selectedCard.overall ?? selectedCard.ovr ?? (selectedCard.marketValue != null ? Math.round(selectedCard.marketValue / 10) : 0),
                    ATA: selectedCard.ATA ?? selectedCard.ata ?? 0,
                    LIF: selectedCard.LIF ?? selectedCard.lif ?? 0,
                    POW: selectedCard.POW ?? selectedCard.pow ?? 0,
                    obtainedAt: selectedCard.obtainedAt,
                    marketValue: selectedCard.marketValue,
                    valueToSell: selectedCard.marketValue ? Math.floor(selectedCard.marketValue / 2) : 0
                };

                buyer.inventory.push(cardToAdd);

                await buyer.save();
                await seller.save();

                selectedCard.status = 'sold';
                await selectedCard.save();

                return i.update({ content: 'Compra realizada com sucesso!', embeds: [], components: [] });
            } else if (i.customId === 'cancel_buy') {
                return i.update({ content: 'Compra cancelada.', embeds: [], components: [] });
            }
        });

        confirmCollector.on('end', () => {
            if (message.editable) {
                message.edit({ components: [] });
            }
        });
    } else {
        // Quando a coleção de interações termina
        if (message.editable) {
            message.edit({ components: [] });
        }
    }
};
