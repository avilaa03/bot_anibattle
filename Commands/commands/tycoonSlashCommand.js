const BaseSlashCommand = require('../utils/BaseSlashCommand');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const magnataRun = require('../actions/run/tycoonRun');

module.exports = class TycoonSlashCommand extends BaseSlashCommand {
    constructor() {
        super('tycoon');
    }

    async run(client, interaction) {
        await magnataRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.magnata.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.magnata.descricao'));
    }
};
