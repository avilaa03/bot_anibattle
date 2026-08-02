const ui = require('../../utils/embeds');

async function sellEnd(interaction) {
    await interaction.followUp({
        embeds: [ui.neutral('Tempo esgotado', 'O anúncio não foi criado. Use `/sell` de novo se ainda quiser vender.')]
    }).catch(() => {});
}

module.exports = { sellEnd };
