const ui = require('../../utils/embeds');

function battleEnd(collector, interaction, userY, t) {
    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            // Ninguém aceitou nem recusou: o desafio simplesmente expirou.
            // Como a aposta só é cobrada no aceite, não há nada a devolver.
            await interaction.editReply({
                content: null,
                embeds: [ui.neutral(
                    t('battle.expirado'),
                    t('battle.expirado_texto', { jogador: userY.username })
                )],
                components: []
            }).catch(() => {});
        }
    });
}

module.exports = { battleEnd };
