const BaseSlashCommand = require('../utils/BaseSlashCommand');

module.exports = class PingSlashCommand extends BaseSlashCommand {
    constructor() {
        super('ping');
    }

    run(client, interaction) {
        return interaction.reply({ content: 'Ping Slash Command'});

    }
}