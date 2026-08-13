const mongoose = require('mongoose');
const User = require('../../utils/userSchema');
const { addBalance } = require('../../utils/economy');
const ui = require('../../utils/embeds');
const { registerDiscovery } = require('../../utils/discovery');
const { registrar } = require('../../utils/progress');
const { notificarProgresso } = require('../../utils/notifications');
const telemetria = require('../../utils/telemetry');
const valores = require('../../utils/cardValues');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

module.exports = (interaction, card, user, marketValue, valueToSell, rollEnd, mostradoEm = null, t = criarT(DEFAULT_LOCALE)) => {
    const filter = (i) => (i.customId.startsWith(`enviarInventario_${card._id}`) || i.customId.startsWith(`vender_${card._id}`)) && i.user.id === interaction.user.id;
    // max: 1 garante que "enviar ao inventário"/"vender" só podem ser
    // processados uma vez, mesmo com clique duplo quase simultâneo.
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async (i) => {
        // Quanto o jogador levou entre a carta aparecer e decidir. Humano
        // leva de 1 a 5 s; macro responde em uns 200 ms. Sem await e com
        // catch: telemetria nunca atrapalha a ação de quem clicou.
        if (mostradoEm) {
            telemetria.registrarClique(interaction.user.id, i.createdTimestamp - mostradoEm)
                .catch(() => {});
        }

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
                // CONGELA a negociabilidade no momento da entrega.
                //
                // Marcar a carta como vinculada no catálogo depois não
                // afeta quem já recebeu: ninguém perde o direito de vender
                // algo que ganhou sob outra regra.
                comercializavel: card.comercializavel !== false,
                obtainedAt: new Date(),
                marketValue: marketValue,
                // O valor NATURAL da carta, sem o bônus de VIP de quem
                // rolou. Ver `cardValues.vendaRapidaPara`: gravar o bônus
                // aqui o tornaria permanente e transferível.
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

            const guardada = t('roll.guardada', { carta: ui.cardName(card) });
            await i.update({
                content: inedita ? `${guardada}\n${t('roll.nova_pokedex')}` : guardada,
                components: []
            });
        } else if (i.customId.startsWith('vender_')) {
            // O bônus de VIP entra AQUI, no crédito, e não no valor gravado.
            // `user` é o documento que o rollRun já carregou, então não
            // custa consulta nova.
            const pago = valores.vendaRapidaPara({ ...card, valueToSell }, user);
            const updated = await addBalance(interaction.user.id, pago);
            await i.update({
                content: t('roll.vendida', {
                    carta: ui.cardName(card),
                    valor: ui.coins(pago, t.locale),
                    saldo: ui.coins(updated?.balance ?? 0, t.locale)
                }),
                components: []
            });
        }
        collector.stop('collected');
    });

    collector.on('end', (collected, reason) => {
        rollEnd(interaction, reason, t);
    });

    return collector;
};
