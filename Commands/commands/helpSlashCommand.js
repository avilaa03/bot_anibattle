const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const helpRun = require('../actions/run/helpRun')

module.exports = class HelpSlashCommand extends BaseSlashCommand {
    constructor() {
        super('help');
    }

    async run(client, interaction) {
        await helpRun(client, interaction)
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(descricaoBase('comandos.help.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.help.descricao'))
        .toJSON();
    }
}