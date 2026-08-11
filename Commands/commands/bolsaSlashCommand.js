const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const bolsaRun = require('../actions/run/bolsaRun.js');
const { descricaoBase, localizacoes } = require('../utils/i18n.js');

module.exports = class BolsaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('bolsa');
    }

    async run(client, interaction) {
        await bolsaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.bolsa.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.bolsa.descricao'))
            .toJSON();
    }
};
