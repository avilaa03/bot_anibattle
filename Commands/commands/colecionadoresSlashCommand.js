const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const colecionadoresRun = require('../actions/run/colecionadoresRun.js');

module.exports = class ColecionadoresSlashCommand extends BaseSlashCommand {
    constructor() {
        super('collectors');
    }

    async run(client, interaction) {
        await colecionadoresRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.colecionadores.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.colecionadores.descricao'))
            .toJSON();
    }
};
