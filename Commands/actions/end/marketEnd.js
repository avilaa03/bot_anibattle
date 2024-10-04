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
                    image: selectedCard.image,
                    rarity: selectedCard.rarity,
                    ovr: selectedCard.ovr,
                    ata: selectedCard.ata,
                    int: selectedCard.int,
                    def: selectedCard.def,
                    des: selectedCard.des,
                    pow: selectedCard.pow,
                    res: selectedCard.res,
                    obtainedAt: selectedCard.obtainedAt,
                    marketValue: selectedCard.marketValue,
                    valueToSell: selectedCard.marketValue / 2
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
