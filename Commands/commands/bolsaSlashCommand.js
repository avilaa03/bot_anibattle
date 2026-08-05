const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const bolsaRun = require('../actions/run/bolsaRun.js');

module.exports = class BolsaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('bolsa');
    }

    async run(client, interaction) {
        await bolsaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra os itens que você tem — gemas, pergaminhos e o que vier')
            .toJSON();
    }
};
