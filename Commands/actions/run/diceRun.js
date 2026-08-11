const ui = require('../../utils/embeds');
const { tDaInteracao } = require('../../utils/language');

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function Dice() {
    return 1 + Math.floor(Math.random() * 6);
}

async function diceRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const dice = Dice();
    const embed = ui.base(ui.STATUS_COLORS.info)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`${FACES[dice - 1]}  ${t('dice.tirou', { valor: dice })}`)
        .setDescription(t('dice.descricao'));
    return interaction.reply({ embeds: [embed] });
}

module.exports = diceRun;
