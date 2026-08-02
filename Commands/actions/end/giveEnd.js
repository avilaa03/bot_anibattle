const ui = require('../../utils/embeds');

function giveEnd(interaction, collected) {
    if (collected.size === 0) {
        interaction.followUp({
            embeds: [ui.neutral('Tempo esgotado', 'A transferência foi cancelada porque você não confirmou a tempo.')]
        }).catch(() => {});
    }
}

module.exports = { giveEnd };
