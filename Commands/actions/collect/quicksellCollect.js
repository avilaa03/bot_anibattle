const { EmbedBuilder } = require('discord.js');
const { updateEmbed, buildConfirmationRow, getValueToSell } = require('../run/quicksellRun.js');

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
        user.balance = (user.balance || 0) + value;
        user.inventory = user.inventory.filter(c => c !== card);
        await user.save();
        const embed = new EmbedBuilder()
            .setTitle('✅ Carta vendida')
            .setDescription(`Você vendeu **${card.name}** por **${value}** moedas.`)
            .setColor('#4CAF50');
        await i.update({ embeds: [embed], components: [] });
        return 'collected';
    }
    if (i.customId === 'cancel_sell') {
        await i.update({
            embeds: [new EmbedBuilder().setTitle('Cancelado').setDescription('Venda cancelada.').setColor('#9E9E9E')],
            components: []
        });
        return 'collected';
    }
}

module.exports = quicksellCollect;
