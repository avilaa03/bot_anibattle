const { SlashCommandBuilder } = require('discord.js');
const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const mymarketRun = require('../actions/run/mymarketRun.js');

module.exports = class MyMarketSlashCommand extends BaseSlashCommand {
    constructor() {
        super('mymarket');
    }

    async run(client, interaction) {
        await mymarketRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra as suas cartas anunciadas no mercado');
    }
};
