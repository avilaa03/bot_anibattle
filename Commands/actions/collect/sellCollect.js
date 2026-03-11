const Market = require('../../utils/marketSchema');
const { EmbedBuilder } = require('discord.js');

async function sellCollect(interaction, collector, matchingCards, indexRef, listingPrice, user, rowNavigation, rowConfirmation, buildSellEmbed) {
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
                overall: card.overall ?? (card.marketValue != null ? Math.round(card.marketValue / 10) : 0),
                ATA: card.ATA ?? 0,
                LIF: card.LIF ?? 0,
                POW: card.POW ?? 0,
                obtainedAt: card.obtainedAt,
                marketValue: card.marketValue,
                listingPrice: listingPrice,
                status: 'available'
            });

            await listing.save();
            await user.save();

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Carta listada')
                .setDescription(`**${card.name}** foi listada no mercado por **${listingPrice}** moedas.`)
                .setColor('#4CAF50');
            await i.update({ embeds: [successEmbed], components: [] });
            collector.stop('collected');
        } else if (i.customId === 'cancel_sell') {
            const cancelEmbed = new EmbedBuilder()
                .setTitle('Cancelado')
                .setDescription('Venda cancelada.')
                .setColor('#9E9E9E');
            await i.update({ embeds: [cancelEmbed], components: [] });
            collector.stop('collected');
        }
    });
}

module.exports = { sellCollect };
