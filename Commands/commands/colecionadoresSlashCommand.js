const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const colecionadoresRun = require('../actions/run/colecionadoresRun.js');

module.exports = class ColecionadoresSlashCommand extends BaseSlashCommand {
    constructor() {
        super('colecionadores');
    }

    async run(client, interaction) {
        await colecionadoresRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Ranking de quem descobriu mais cartas na Pokédex')
            .toJSON();
    }
};
