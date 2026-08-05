async function aprimorarEnd(interaction, reason) {
    if (reason === 'time') {
        await interaction.followUp({ content: 'O tempo para aprimorar expirou. Nenhuma gema foi gasta.', components: [] });
    }
}

module.exports = aprimorarEnd;
