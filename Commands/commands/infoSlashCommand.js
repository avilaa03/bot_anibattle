const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const infoRun = require('../actions/run/infoRun.js')

module.exports = class InfoSlashCommand extends BaseSlashCommand {
    constructor() {
        super('info');
    }

    async run(client, interaction) {
        await infoRun(client, interaction)
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(descricaoBase('comandos.info.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.info.descricao'))
        .toJSON();
    }
}