const BaseSlashCommand = require('../utils/BaseSlashCommand');

module.exports = class StatsSlashCommand extends BaseSlashCommand {
    constructor() {
        super('stats');
    }

    run(client, interaction) {
        return interaction.reply({ content: 'Stats Slash Command'});

    }
}