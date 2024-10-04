module.exports = (interaction, reason) => {
    if (reason === 'time') {
        interaction.followUp({ content: 'O tempo para coletar a carta expirou.', components: [] });
    }
};
