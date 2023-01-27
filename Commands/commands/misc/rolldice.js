const BaseSlashCommand = require('../../utils/BaseSlashCommand');

module.exports = class RollDiceSlashCommand extends BaseSlashCommand {
    constructor() {
        super('rolldice');
    }

    run(client, interaction) {
        return interaction.reply({ content: 'Roll Dice Slash Command'});

    }
}