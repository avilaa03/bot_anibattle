const ui = require('../../utils/embeds');

function battleEnd(collector, interaction, userY) {
    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            // Ninguém aceitou nem recusou: o desafio simplesmente expirou.
            // Como a aposta só é cobrada no aceite, não há nada a devolver.
            await interaction.editReply({
                content: null,
                embeds: [ui.neutral('Desafio expirado', `**${userY.username}** não respondeu a tempo. Nenhuma moeda foi cobrada.`)],
                components: []
            }).catch(() => {});
        }
    });
}

module.exports = { battleEnd };
