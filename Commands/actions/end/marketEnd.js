const User = require('../../utils/userSchema');
const Market = require('../../utils/marketSchema');
const { trySpend, addBalance, applyMarketTax, MARKET_TAX_RATE } = require('../../utils/economy');
const { registerDiscovery } = require('../../utils/discovery');
const { registrar } = require('../../utils/progresso');
const ui = require('../../utils/embeds');
const valores = require('../../utils/valores');

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
                    return i.update({ embeds: [ui.error('Carta indisponível', 'Esta carta já foi vendida para outro jogador.')], components: [] });
                }

                const buyer = await trySpend(interaction.user.id, reserved.listingPrice);
                if (!buyer) {
                    // Desfaz a reserva se o comprador não tiver saldo suficiente.
                    await Market.findOneAndUpdate({ _id: reserved._id }, { status: 'available' });
                    return i.update({ embeds: [ui.error('Saldo insuficiente', `Esta carta custa ${ui.coins(reserved.listingPrice)} e você não tem esse valor.`)], components: [] });
                }

                // O vendedor recebe o preço menos a taxa. A taxa não vai
                // para ninguém — ela é destruída, e é justamente esse sink
                // que segura a inflação da economia do bot.
                const { tax, sellerReceives } = applyMarketTax(reserved.listingPrice);
                await addBalance(reserved.sellerId, sellerReceives);

                const catalogoId = reserved.originalCardId || reserved.cardId;

                // Os dois valores saem do MESMO cálculo. Guardar o
                // marketValue antigo e recalcular só a venda rápida
                // deixaria uma carta anterior à migração com os dois campos
                // discordando entre si — e como toda carta comprada passa
                // por aqui, este ponto conserta o acervo aos poucos.
                const preco = valores.valoresDaCarta(reserved);

                const cardToAdd = {
                    cardId: reserved.cardId,
                    originalCardId: catalogoId,
                    name: reserved.cardName,
                    series: reserved.series,
                    seriesImage: reserved.seriesImage,
                    baseImage: reserved.baseImage,
                    characterImage: reserved.characterImage,
                    rarity: reserved.rarity,
                    overall: preco.overall,
                    ATA: reserved.ATA ?? 0,
                    LIF: reserved.LIF ?? 0,
                    POW: reserved.POW ?? 0,
                    obtainedAt: reserved.obtainedAt,
                    marketValue: preco.marketValue,
                    valueToSell: preco.valueToSell
                };

                await User.findOneAndUpdate(
                    { id: interaction.user.id },
                    { $push: { inventory: cardToAdd } },
                    { upsert: true, setDefaultsOnInsert: true }
                );

                const inedita = catalogoId ? await registerDiscovery(interaction.user.id, catalogoId) : false;

                const embed = ui.success('Compra realizada', `${ui.getRarity(reserved.rarity).emoji} **${ui.cardName(reserved.cardName)}** agora é sua!`)
                    .addFields(
                        { name: 'Você pagou', value: ui.coins(reserved.listingPrice), inline: true },
                        { name: 'Vendedor recebeu', value: ui.coins(sellerReceives), inline: true },
                        { name: `Taxa (${Math.round(MARKET_TAX_RATE * 100)}%)`, value: ui.coins(tax), inline: true },
                        { name: 'Seu saldo', value: ui.coins(buyer.balance), inline: true }
                    );
                if (inedita) {
                    embed.setDescription(`${embed.data.description}\n\n📖 **Nova entrada na Pokédex!**`);
                }

                registrar(interaction.user.id, { comprasMercado: 1 }, {
                    eventosMissao: inedita ? ['mercado', 'descoberta'] : ['mercado']
                }).catch(() => {});

                return i.update({ embeds: [embed], components: [] });
            } else if (i.customId === 'cancel_buy') {
                return i.update({ embeds: [ui.neutral('Compra cancelada', 'Nenhuma moeda foi gasta.')], components: [] });
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
