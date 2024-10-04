const { SlashCommandBuilder } = require('discord.js');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const sellRun = require('../actions/run/sellRun');

module.exports = class SellSlashCommand extends BaseSlashCommand {
    constructor() {
        super('sell');
    }

    async run(client, interaction) {
        await sellRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Lista uma carta do seu inventário no mercado')
            .addStringOption(option => option.setName('cardname').setDescription('Nome da carta').setRequired(true))
            .addIntegerOption(option => option.setName('price').setDescription('Preço de venda').setRequired(true));
    }
};
