const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const bolsaRun = require('../actions/run/bolsaRun.js');
const { descricaoBase, localizacoes } = require('../utils/i18n.js');

module.exports = class BolsaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('bag');
    }

    async run(client, interaction) {
        await bolsaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.bolsa.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.bolsa.descricao'))
            .toJSON();
    }
};
