const { updateEmbed, buildConfirmationRow, getValueToSell } = require('../run/quicksellRun.js');
const User = require('../../utils/userSchema');
const { addBalance } = require('../../utils/economy');
const ui = require('../../utils/embeds');
const transacoes = require('../../utils/transacoes');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

async function quicksellCollect(i, indexRef, matchingCards, user, rowNavigation, t = criarT(DEFAULT_LOCALE)) {
    if (i.customId === 'prev') {
        indexRef.currentIndex = (indexRef.currentIndex - 1 + matchingCards.length) % matchingCards.length;
        const card = matchingCards[indexRef.currentIndex];
        await i.update({
            embeds: [updateEmbed(card, t)],
            components: [rowNavigation, buildConfirmationRow(card, t)]
        });
        return;
    }
    if (i.customId === 'next') {
        indexRef.currentIndex = (indexRef.currentIndex + 1) % matchingCards.length;
        const card = matchingCards[indexRef.currentIndex];
        await i.update({
            embeds: [updateEmbed(card, t)],
            components: [rowNavigation, buildConfirmationRow(card, t)]
        });
        return;
    }
    if (i.customId === 'confirm_sell') {
        const card = matchingCards[indexRef.currentIndex];
        const value = getValueToSell(card);

        // Remoção atômica pelo _id da subdocument: se a carta já não estiver
        // mais no inventário (ex: já foi vendida por outro clique/canal),
        // updatedUser vem null e não pagamos duas vezes pela mesma carta.
        const updatedUser = await User.findOneAndUpdate(
            { id: user.id, 'inventory._id': card._id },
            { $pull: { inventory: { _id: card._id } } }
        );
        if (!updatedUser) {
            const embed = ui.error(t('market.indisponivel'), t('sell.sumiu_do_inventario'));
            await i.update({ embeds: [embed], components: [] });
            return 'collected';
        }

        const atualizado = await addBalance(user.id, value);

        // Venda rápida CRIA moeda do nada — é a torneira de inflação do
        // jogo. Registrar aqui é o que permite medir o tamanho dela, que
        // hoje só dá para estimar.
        transacoes.registrar({
            userId: user.id,
            tipo: 'venda_rapida',
            moedaDelta: value,
            saldoDepois: atualizado?.balance ?? null,
            contexto: {
                carta: card.name,
                raridade: card.rarity,
                overall: card.overall ?? null,
                nivel: card.nivel ?? 0
            }
        });

        const embed = ui.success(t('quicksell.vendida'), t('quicksell.vendida_texto', {
            carta: ui.cardName(card),
            valor: ui.coins(value, t.locale)
        }))
            .addFields({
                name: t('quicksell.saldo_atual'),
                value: ui.coins(atualizado?.balance ?? 0, t.locale),
                inline: true
            });
        await i.update({ embeds: [embed], components: [] });
        return 'collected';
    }
    if (i.customId === 'cancel_sell') {
        await i.update({
            embeds: [ui.neutral(t('quicksell.cancelada'), t('sell.cancelado_texto'))],
            components: []
        });
        return 'collected';
    }
}

module.exports = quicksellCollect;
