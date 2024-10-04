async function battleEnd(collector, interaction, userY) {
    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            await interaction.editReply({
                content: `${userY.username} não respondeu a tempo, batalha cancelada`,
                components: []
            });
        }
    });
}

module.exports = { battleEnd };
