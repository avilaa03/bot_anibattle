async function quicksellEnd(interaction, reason) {
    if (reason === 'time') {
        await interaction.followUp({ content: 'O tempo para vender a carta expirou.', components: [] });
    }
}

module.exports = quicksellEnd;
