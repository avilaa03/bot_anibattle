const User = require('../../utils/userSchema');
const Market = require('../../utils/marketSchema');
const { trySpend, addBalance } = require('../../utils/economy');

module.exports = async (message, selectedCard, interaction) => {
    if (selectedCard) {
        const confirmFilter = (i) => ['confirm_buy', 'cancel_buy'].includes(i.customId) && i.user.id === interaction.user.id;
        const confirmCollector = message.createMessageComponentCollector({ filter: confirmFilter, time: 60000, max: 1 });

        confirmCollector.on('collect', async (i) => {
            if (i.customId === 'confirm_buy') {
                // Reserva o anúncio de forma atômica (status: available -> sold).
                // Se dois compradores confirmarem quase ao mesmo tempo, só o
                // primeiro consegue reservar; o segundo recebe null aqui.
                const reserved = await Market.findOneAndUpdate(
                    { _id: selectedCard._id, status: 'available' },
                    { status: 'sold' },
                    { new: true }
                );
                if (!reserved) {
                    return i.update({ content: 'Esta carta já foi vendida para outro jogador.', embeds: [], components: [] });
                }

                const buyer = await trySpend(interaction.user.id, reserved.listingPrice);
                if (!buyer) {
                    // Desfaz a reserva se o comprador não tiver saldo suficiente.
                    await Market.findOneAndUpdate({ _id: reserved._id }, { status: 'available' });
                    return i.update({ content: 'Você não tem dinheiro suficiente para comprar esta carta.', embeds: [], components: [] });
                }

                await addBalance(reserved.sellerId, reserved.listingPrice);

                const cardToAdd = {
                    cardId: reserved.cardId,
                    originalCardId: reserved.cardId,
                    name: reserved.cardName,
                    series: reserved.series,
                    seriesImage: reserved.seriesImage,
                    baseImage: reserved.baseImage,
                    characterImage: reserved.characterImage,
                    rarity: reserved.rarity,
                    overall: reserved.overall ?? (reserved.marketValue != null ? Math.round(reserved.marketValue / 10) : 0),
                    ATA: reserved.ATA ?? 0,
                    LIF: reserved.LIF ?? 0,
                    POW: reserved.POW ?? 0,
                    obtainedAt: reserved.obtainedAt,
                    marketValue: reserved.marketValue,
                    valueToSell: reserved.marketValue ? Math.floor(reserved.marketValue / 2) : 0
                };

                await User.findOneAndUpdate(
                    { id: interaction.user.id },
                    { $push: { inventory: cardToAdd } },
                    { upsert: true, setDefaultsOnInsert: true }
                );

                return i.update({ content: 'Compra realizada com sucesso!', embeds: [], components: [] });
            } else if (i.customId === 'cancel_buy') {
                return i.update({ content: 'Compra cancelada.', embeds: [], components: [] });
            }
        });

        confirmCollector.on('end', () => {
            if (message.editable) {
                message.edit({ components: [] }).catch(() => {});
            }
        });
    } else {
        // Quando a coleção de interações termina
        if (message.editable) {
            message.edit({ components: [] }).catch(() => {});
        }
    }
};
