const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');

module.exports = class PingSlashCommand extends BaseSlashCommand {
    constructor() {
        super('ping');
    }

    run(client, interaction) {
        return interaction.reply({ content: 'Pong!'});
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('ping command')
        .toJSON();
    }
}