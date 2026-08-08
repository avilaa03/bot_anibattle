const ui = require('../../utils/embeds');

async function sellEnd(interaction, t) {
    await interaction.followUp({
        embeds: [ui.neutral(t('comum.tempo_esgotado'), t('sell.tempo_esgotado_texto'))]
    }).catch(() => {});
}

module.exports = { sellEnd };
