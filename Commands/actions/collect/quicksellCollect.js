function updateEmbed(card) {
    const embed = new EmbedBuilder()
        .setTitle('AniBattle')
        .setImage(card.image)
        .addFields(
            { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
            { name: "Raridade", value: card.rarity },
            { name: "Valor de Venda", value: `${card.valueToSell} moedas` }
        );
    return embed;
}

async function quicksellCollect(i, currentIndex, matchingCards, user, rowNavigation, rowConfirmation) {
    if (i.customId === 'prev') {
        currentIndex = (currentIndex - 1 + matchingCards.length) % matchingCards.length;
        await i.update({ embeds: [updateEmbed(matchingCards[currentIndex])], components: [rowNavigation, rowConfirmation] });
    } else if (i.customId === 'next') {
        currentIndex = (currentIndex + 1) % matchingCards.length;
        await i.update({ embeds: [updateEmbed(matchingCards[currentIndex])], components: [rowNavigation, rowConfirmation] });
    } else if (i.customId === 'confirm_sell') {
        const card = matchingCards[currentIndex];
        user.balance += card.valueToSell;
        user.inventory = user.inventory.filter(c => c._id.toString() !== card._id.toString());
        await user.save();
        await i.update({ content: `Você vendeu a carta por ${card.valueToSell} moedas!`, embeds: [], components: [] });
        return 'collected';
    } else if (i.customId === 'cancel_sell') {
        await i.update({ content: 'Venda cancelada.', embeds: [], components: [] });
        return 'collected';
    }
    return { currentIndex };
}

module.exports = quicksellCollect;
