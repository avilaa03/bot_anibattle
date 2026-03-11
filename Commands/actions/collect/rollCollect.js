const mongoose = require('mongoose');

module.exports = (interaction, card, user, marketValue, valueToSell, rollEnd) => {
    const filter = (i) => (i.customId.startsWith(`enviarInventario_${card._id}`) || i.customId.startsWith(`vender_${card._id}`)) && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async (i) => {
        if (i.customId.startsWith('enviarInventario_')) {
            const clonedCard = {
                cardId: new mongoose.Types.ObjectId(),
                originalCardId: card._id,
                name: card.name,
                series: card.series,
                seriesImage: card.seriesImage,
                baseImage: card.baseImage,
                characterImage: card.characterImage,
                rarity: card.rarity,
                overall: card.overall,
                ATA: card.ATA,
                LIF: card.LIF,
                POW: card.POW,
                obtainedAt: new Date(),
                marketValue: marketValue,
                valueToSell: valueToSell
            };

            user.inventory.push(clonedCard);

            if (!user.favCard) {
                user.favCard = clonedCard.cardId;
            }

            await user.save();
            await i.update({ content: 'Carta enviada ao seu inventário!', components: [] });
        } else if (i.customId.startsWith('vender_')) {
            user.balance += valueToSell;
            await user.save();
            await i.update({ content: `Você vendeu a carta por ${valueToSell} moedas!`, components: [] });
        }
        collector.stop('collected');
    });

    collector.on('end', (collected, reason) => {
        rollEnd(interaction, reason);
    });

    return collector;
};
