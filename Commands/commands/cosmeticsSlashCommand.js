const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const cosmeticosRun = require('../actions/run/cosmeticsRun.js');

module.exports = class CosmeticsSlashCommand extends BaseSlashCommand {
    constructor() {
        super('cosmetics');
    }

    async run(client, interaction) {
        await cosmeticosRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.cosmeticos.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.cosmeticos.descricao'))
            .toJSON();
    }
};
