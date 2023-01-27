const BaseSlashCommand = require('../utils/BaseSlashCommand');

module.exports = class WhoisSlashCommand extends BaseSlashCommand {
    constructor() {
        super('whois');
    }

    run(client, interaction) {
        return interaction.reply({ content: 'Whois Slash Command'});

    }
}
