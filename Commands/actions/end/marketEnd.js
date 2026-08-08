const User = require('../../utils/userSchema');
const Market = require('../../utils/marketSchema');
const { trySpend, addBalance, applyMarketTax, MARKET_TAX_RATE } = require('../../utils/economy');
const { registerDiscovery } = require('../../utils/discovery');
const { registrar } = require('../../utils/progresso');
const ui = require('../../utils/embeds');

module.exports = async (message, selectedCard, interaction, t) => {
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
                    return i.update({ embeds: [ui.error(t('market.indisponivel'), t('market.ja_vendida'))], components: [] });
                }

                const buyer = await trySpend(interaction.user.id, reserved.listingPrice);
                if (!buyer) {
                    // Desfaz a reserva se o comprador não tiver saldo suficiente.
                    await Market.findOneAndUpdate({ _id: reserved._id }, { status: 'available' });
                    return i.update({
                        embeds: [ui.error(t('comum.saldo_insuficiente'), t('market.sem_saldo', { valor: ui.coins(reserved.listingPrice, t.locale) }))],
                        components: []
                    });
                }

                // O vendedor recebe o preço menos a taxa. A taxa não vai
                // para ninguém — ela é destruída, e é justamente esse sink
                // que segura a inflação da economia do bot.
                const { tax, sellerReceives } = applyMarketTax(reserved.listingPrice);
                await addBalance(reserved.sellerId, sellerReceives);

                const catalogoId = reserved.originalCardId || reserved.cardId;

                const cardToAdd = {
                    cardId: reserved.cardId,
                    originalCardId: catalogoId,
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

                const inedita = catalogoId ? await registerDiscovery(interaction.user.id, catalogoId) : false;

                const embed = ui.success(
                    t('market.compra_titulo'),
                    t('market.compra_texto', {
                        emoji: ui.getRarity(reserved.rarity, t.locale).emoji,
                        carta: ui.cardName(reserved.cardName, t.locale)
                    })
                ).addFields(
                    { name: t('market.voce_pagou'), value: ui.coins(reserved.listingPrice, t.locale), inline: true },
                    { name: t('market.vendedor_recebeu'), value: ui.coins(sellerReceives, t.locale), inline: true },
                    { name: t('market.taxa', { porcento: Math.round(MARKET_TAX_RATE * 100) }), value: ui.coins(tax, t.locale), inline: true },
                    { name: t('market.seu_saldo'), value: ui.coins(buyer.balance, t.locale), inline: true }
                );
                if (inedita) {
                    embed.setDescription(`${embed.data.description}\n\n${t('market.nova_pokedex')}`);
                }

                registrar(interaction.user.id, { comprasMercado: 1 }, {
                    eventosMissao: inedita ? ['mercado', 'descoberta'] : ['mercado']
                }).catch(() => {});

                return i.update({ embeds: [embed], components: [] });
            } else if (i.customId === 'cancel_buy') {
                return i.update({ embeds: [ui.neutral(t('market.cancelada'), t('market.cancelada_texto'))], components: [] });
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
