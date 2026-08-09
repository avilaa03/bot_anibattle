const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
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
            .setDescription(descricaoBase('comandos.mymarket.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.mymarket.descricao'));
    }
};
