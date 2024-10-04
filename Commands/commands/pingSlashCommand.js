const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const pingRun = require('../actions/run/pingRun')

module.exports = class PingSlashCommand extends BaseSlashCommand {
    constructor() {
        super('ping');
    }

    async run(client, interaction) {
        await pingRun(client, interaction)
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('ping command')
        .toJSON();
    }
}