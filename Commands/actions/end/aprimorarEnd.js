async function aprimorarEnd(interaction, reason, t) {
    if (reason === 'time') {
        await interaction.followUp({ content: t('aprimorar.expirou'), components: [] });
    }
}

module.exports = aprimorarEnd;
