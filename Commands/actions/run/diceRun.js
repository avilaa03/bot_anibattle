const ui = require('../../utils/embeds');

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function Dice() {
    return 1 + Math.floor(Math.random() * 6);
}

async function diceRun(client, interaction) {
    const dice = Dice();
    const embed = ui.base(ui.STATUS_COLORS.info)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`${FACES[dice - 1]}  Você tirou ${dice}`)
        .setDescription('Dado de 6 lados.');
    return interaction.reply({ embeds: [embed] });
}

module.exports = diceRun;
