async function sellEnd(interaction) {
    await interaction.followUp({ content: 'O tempo para vender a carta expirou.', components: [] });
}

module.exports = { sellEnd };
