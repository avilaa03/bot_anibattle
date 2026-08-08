const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
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
            .setDescription(descricaoBase('comandos.sell.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.sell.descricao'))
            .addStringOption(option => option.setName('cardname').setDescription(descricaoBase('comandos.sell.opcao_cardname'))
                    .setDescriptionLocalizations(localizacoes('comandos.sell.opcao_cardname')).setRequired(true))
            .addIntegerOption(option => option.setName('price').setDescription(descricaoBase('comandos.sell.opcao_price'))
                    .setDescriptionLocalizations(localizacoes('comandos.sell.opcao_price')).setRequired(true));
    }
};
