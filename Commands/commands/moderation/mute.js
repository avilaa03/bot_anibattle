const BaseSlashCommand = require('../../utils/BaseSlashCommand');

module.exports = class MuteSlashCommand extends BaseSlashCommand {
    constructor() {
        super('mute');
    }

    run(client, interaction) {
        return interaction.reply({ content: 'Mute Slash Command'});

    }
}