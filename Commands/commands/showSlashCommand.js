const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const showRun = require('../actions/run/showRun');

module.exports = class ShowSlashCommand extends BaseSlashCommand {
    constructor() {
        super('show');
    }

    async run(client, interaction) {
        await showRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra uma carta do seu inventário pelo nome')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('O nome da carta que você quer mostrar')
                    .setRequired(true)
            );
    }
};
