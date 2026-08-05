async function desmancharEnd(interaction, reason) {
    if (reason === 'time') {
        await interaction.followUp({ content: 'O tempo para desmanchar a carta expirou. Nada foi destruído.', components: [] });
    }
}

module.exports = desmancharEnd;
