function giveEnd(interaction, collected) {
    if (collected.size === 0) {
        interaction.followUp({ content: 'Tempo esgotado. Operação cancelada.' });
    }
}

module.exports = { giveEnd };
