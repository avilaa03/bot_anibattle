const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const missoesRun = require('../actions/run/missoesRun.js');

module.exports = class MissoesSlashCommand extends BaseSlashCommand {
    constructor() {
        super('missoes');
    }

    async run(client, interaction) {
        await missoesRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.missoes.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.missoes.descricao'))
            .toJSON();
    }
};
