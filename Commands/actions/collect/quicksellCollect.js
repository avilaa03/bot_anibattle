const { updateEmbed, buildConfirmationRow, getValueToSell } = require('../run/quicksellRun.js');
const User = require('../../utils/userSchema');
const { addBalance } = require('../../utils/economy');
const ui = require('../../utils/embeds');

async function quicksellCollect(i, indexRef, matchingCards, user, rowNavigation) {
    if (i.customId === 'prev') {
        indexRef.currentIndex = (indexRef.currentIndex - 1 + matchingCards.length) % matchingCards.length;
        const card = matchingCards[indexRef.currentIndex];
        await i.update({
            embeds: [updateEmbed(card)],
            components: [rowNavigation, buildConfirmationRow(card)]
        });
        return;
    }
    if (i.customId === 'next') {
        indexRef.currentIndex = (indexRef.currentIndex + 1) % matchingCards.length;
        const card = matchingCards[indexRef.currentIndex];
        await i.update({
            embeds: [updateEmbed(card)],
            components: [rowNavigation, buildConfirmationRow(card)]
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
            const embed = ui.error('Carta indisponível', 'Essa carta não está mais no seu inventário.');
            await i.update({ embeds: [embed], components: [] });
            return 'collected';
        }

        const atualizado = await addBalance(user.id, value);

        const embed = ui.success('Carta vendida', `**${ui.cardName(card.name)}** foi vendida por ${ui.coins(value)}.`)
            .addFields({ name: 'Saldo atual', value: ui.coins(atualizado?.balance ?? 0), inline: true });
        await i.update({ embeds: [embed], components: [] });
        return 'collected';
    }
    if (i.customId === 'cancel_sell') {
        await i.update({
            embeds: [ui.neutral('Venda cancelada', 'Sua carta continua no inventário.')],
            components: []
        });
        return 'collected';
    }
}

module.exports = quicksellCollect;
