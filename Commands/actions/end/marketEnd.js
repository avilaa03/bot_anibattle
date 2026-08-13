const User = require('../../utils/userSchema');
const Market = require('../../utils/marketSchema');
const { trySpend, addBalance, applyMarketTax } = require('../../utils/economy');
const { registerDiscovery } = require('../../utils/discovery');
const { registrar } = require('../../utils/progress');
const ui = require('../../utils/embeds');
const valores = require('../../utils/cardValues');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

module.exports = async (message, selectedCard, interaction, t = criarT(DEFAULT_LOCALE)) => {
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
                    return i.update({
                        embeds: [ui.error(t('market.indisponivel'), t('market.ja_vendida'))],
                        components: []
                    });
                }

                const buyer = await trySpend(interaction.user.id, reserved.listingPrice);
                if (!buyer) {
                    // Desfaz a reserva se o comprador não tiver saldo suficiente.
                    await Market.findOneAndUpdate({ _id: reserved._id }, { status: 'available' });
                    return i.update({
                        embeds: [ui.error(
                            t('comum.saldo_insuficiente'),
                            t('market.sem_saldo', { valor: ui.coins(reserved.listingPrice, t.locale) })
                        )],
                        components: []
                    });
                }

                // O vendedor recebe o preço menos a taxa. A taxa não vai
                // para ninguém — ela é destruída, e é justamente esse sink
                // que segura a inflação da economia do bot.
                //
                // A alíquota é a do VENDEDOR, e é lida AGORA: um plano que
                // venceu entre anunciar e vender cobra a taxa cheia, e um
                // assinado no meio do caminho já vale. Congelar a alíquota
                // no anúncio criaria isenção vitalícia para quem anunciasse
                // tudo no último dia da assinatura.
                const vendedor = await User.findOne({ id: reserved.sellerId })
                    .select('vip')
                    .lean()
                    .catch(() => null);
                const { tax, rate, sellerReceives } = applyMarketTax(reserved.listingPrice, vendedor);
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
                    // Só carta negociável chega ao mercado, mas o campo
                    // viaja junto para a cópia nova nascer coerente.
                    comercializavel: reserved.comercializavel !== false,
                    // O aprimoramento chega junto com a carta. Anúncios
                    // criados antes deste campo existir vêm sem `nivel`, e
                    // aí a carta é natural mesmo — `base` ausente faz o
                    // /aprimorar tratar os valores atuais como naturais.
                    nivel: reserved.nivel ?? 0,
                    base: reserved.base,
                    marketValue: preco.marketValue,
                    valueToSell: preco.valueToSell
                };

                await User.findOneAndUpdate(
                    { id: interaction.user.id },
                    { $push: { inventory: cardToAdd } },
                    { upsert: true, setDefaultsOnInsert: true }
                );

                const inedita = catalogoId ? await registerDiscovery(interaction.user.id, catalogoId) : false;

                const embed = ui.success(t('market.compra_titulo'), t('market.compra_texto', {
                    emoji: ui.getRarity(reserved.rarity, t.locale).emoji,
                    carta: ui.cardName(reserved)
                }))
                    .addFields(
                        { name: t('market.voce_pagou'), value: ui.coins(reserved.listingPrice, t.locale), inline: true },
                        { name: t('market.vendedor_recebeu'), value: ui.coins(sellerReceives, t.locale), inline: true },
                        {
                            name: t('market.taxa', { porcento: ui.percent(rate, t.locale) }),
                            value: ui.coins(tax, t.locale),
                            inline: true
                        },
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
                return i.update({
                    embeds: [ui.neutral(t('market.cancelada'), t('market.cancelada_texto'))],
                    components: []
                });
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
