const Market = require('../../utils/marketSchema');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const valores = require('../../utils/cardValues');
const aprimoramento = require('../../utils/upgrading');
const { applyMarketTax, MARKET_TAX_RATE } = require('../../utils/economy');
const { registrar } = require('../../utils/progress');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

async function sellCollect(interaction, collector, matchingCards, indexRef, listingPrice, user, rowNavigation, rowConfirmation, buildSellEmbed, t = criarT(DEFAULT_LOCALE)) {
    collector.on('collect', async (i) => {
        if (i.customId === 'prev') {
            indexRef.currentIndex = (indexRef.currentIndex - 1 + matchingCards.length) % matchingCards.length;
            const card = matchingCards[indexRef.currentIndex];
            await i.deferUpdate();
            const { embed, attachment } = await buildSellEmbed(card, listingPrice);
            await i.editReply({ embeds: [embed], components: [rowNavigation, rowConfirmation], files: [attachment] });
        } else if (i.customId === 'next') {
            indexRef.currentIndex = (indexRef.currentIndex + 1) % matchingCards.length;
            const card = matchingCards[indexRef.currentIndex];
            await i.deferUpdate();
            const { embed, attachment } = await buildSellEmbed(card, listingPrice);
            await i.editReply({ embeds: [embed], components: [rowNavigation, rowConfirmation], files: [attachment] });
        } else if (i.customId === 'confirm_sell') {
            const card = matchingCards[indexRef.currentIndex];

            // Remoção atômica pelo _id da subdocument, em vez de reatribuir
            // o array inteiro a partir de uma cópia que pode estar
            // desatualizada (o usuário pode ter feito outra ação entre abrir
            // o /sell e confirmar). Se a carta já não estiver mais lá,
            // aborta em vez de recriar o anúncio a partir de dado velho.
            const updatedUser = await User.findOneAndUpdate(
                { id: user.id, 'inventory._id': card._id },
                { $pull: { inventory: { _id: card._id } } }
            );
            if (!updatedUser) {
                const missingEmbed = ui.error(t('market.indisponivel'), t('sell.sumiu_do_inventario'));
                await i.update({ embeds: [missingEmbed], components: [] });
                collector.stop('collected');
                return;
            }

            const listing = new Market({
                cardId: card._id,
                // Sem isto a carta perde o vínculo com o catálogo ao passar
                // pelo mercado, e o comprador não consegue registrá-la na Pokédex.
                originalCardId: card.originalCardId,
                sellerId: interaction.user.id,
                cardName: card.name,
                series: card.series,
                seriesImage: card.seriesImage,
                baseImage: card.baseImage,
                characterImage: card.characterImage,
                rarity: card.rarity,
                comercializavel: card.comercializavel !== false,
                overall: valores.overallDaCarta(card),
                ATA: card.ATA ?? 0,
                LIF: card.LIF ?? 0,
                POW: card.POW ?? 0,
                obtainedAt: card.obtainedAt,
                // O aprimoramento viaja junto: sem isto a carta volta ao
                // comprador como natural. Ver `utils/marketSchema.js`.
                nivel: card.nivel ?? 0,
                base: aprimoramento.baseDaCarta(card),
                marketValue: card.marketValue,
                listingPrice: listingPrice,
                status: 'available'
            });

            await listing.save();

            const { tax, sellerReceives } = applyMarketTax(listingPrice);
            const successEmbed = ui.success(t('sell.anunciada'), t('sell.anunciada_texto', {
                emoji: ui.getRarity(card.rarity, t.locale).emoji,
                carta: ui.cardName(card),
                valor: ui.coins(listingPrice, t.locale)
            }))
                .addFields(
                    { name: t('sell.recebe_na_venda'), value: ui.coins(sellerReceives, t.locale), inline: true },
                    {
                        name: t('sell.taxa_mercado', { porcento: Math.round(MARKET_TAX_RATE * 100) }),
                        value: ui.coins(tax, t.locale),
                        inline: true
                    }
                )
                .setFooter({ text: `${ui.BRAND} • ${t('sell.rodape_undosell')}` });
            await i.update({ embeds: [successEmbed], components: [], files: [] });
            registrar(interaction.user.id, { vendasMercado: 1 }, { eventosMissao: ['venda', 'mercado'] }).catch(() => {});
            collector.stop('collected');
        } else if (i.customId === 'cancel_sell') {
            const cancelEmbed = ui.neutral(t('sell.cancelado'), t('sell.cancelado_texto'));
            await i.update({ embeds: [cancelEmbed], components: [], files: [] });
            collector.stop('collected');
        }
    });
}

module.exports = { sellCollect };
