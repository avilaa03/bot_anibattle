const { SlashCommandBuilder } = require('discord.js');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const undosellRun = require('../actions/run/undosellRun')

module.exports = class UndoSellSlashCommand extends BaseSlashCommand {
    constructor() {
        super('undosell');
    }

    async run(client, interaction) {
        await undosellRun(client, interaction)
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Desfaz o anúncio de uma carta no mercado')
            .addStringOption(option => option.setName('cardname').setDescription('Nome da carta').setRequired(true));
    }
};
