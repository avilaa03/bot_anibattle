const mongoose = require('mongoose');
const User = require('../../utils/userSchema');
const { addBalance } = require('../../utils/economy');
const ui = require('../../utils/embeds');
const { registerDiscovery } = require('../../utils/discovery');
const { registrar } = require('../../utils/progresso');
const { notificarProgresso } = require('../../utils/notificacoes');

module.exports = (interaction, card, user, marketValue, valueToSell, rollEnd) => {
    const filter = (i) => (i.customId.startsWith(`enviarInventario_${card._id}`) || i.customId.startsWith(`vender_${card._id}`)) && i.user.id === interaction.user.id;
    // max: 1 garante que "enviar ao inventário"/"vender" só podem ser
    // processados uma vez, mesmo com clique duplo quase simultâneo.
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

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

            const updatedUser = await User.findOneAndUpdate(
                { id: interaction.user.id },
                { $push: { inventory: clonedCard } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );

            if (!updatedUser.favCard) {
                updatedUser.favCard = clonedCard.cardId;
                await updatedUser.save();
            }

            // Pokédex: registra a descoberta e avisa se for inédita.
            const inedita = await registerDiscovery(interaction.user.id, card._id);
            if (inedita) {
                registrar(interaction.user.id, {}, { eventosMissao: ['descoberta'] })
                    .then((r) => notificarProgresso(interaction, r))
                    .catch(() => {});
            }

            await i.update({
                content: inedita
                    ? `🎴 **${ui.cardName(card.name)}** foi guardada no seu inventário.\n📖 **Nova entrada na Pokédex!** Veja em \`/pokedex\`.`
                    : `🎴 **${ui.cardName(card.name)}** foi guardada no seu inventário.`,
                components: []
            });
        } else if (i.customId.startsWith('vender_')) {
            const updated = await addBalance(interaction.user.id, valueToSell);
            await i.update({
                content: `🪙 Você vendeu **${ui.cardName(card.name)}** por ${ui.coins(valueToSell)}. Saldo: ${ui.coins(updated?.balance ?? 0)}`,
                components: []
            });
        }
        collector.stop('collected');
    });

    collector.on('end', (collected, reason) => {
        rollEnd(interaction, reason);
    });

    return collector;
};
