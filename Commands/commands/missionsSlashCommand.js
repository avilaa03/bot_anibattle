const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/commandNames.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const missoesRun = require('../actions/run/missionsRun.js');

module.exports = class MissionsSlashCommand extends BaseSlashCommand {
    constructor() {
        super('missions');
    }

    async run(client, interaction) {
        await missoesRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.missoes.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.missoes.descricao'))
            .toJSON();
    }
};
