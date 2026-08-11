async function desmancharEnd(interaction, reason, t) {
    if (reason === 'time') {
        await interaction.followUp({ content: t('desmanchar.expirou'), components: [] });
    }
}

module.exports = desmancharEnd;
