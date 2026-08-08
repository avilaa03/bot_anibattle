async function quicksellEnd(interaction, reason, t) {
    if (reason === 'time') {
        await interaction.followUp({ content: t('quicksell.expirou'), components: [] });
    }
}

module.exports = quicksellEnd;
