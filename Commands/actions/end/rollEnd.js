module.exports = (interaction, reason, t) => {
    if (reason === 'time') {
        interaction.followUp({ content: t('roll.expirou'), components: [] });
    }
};
