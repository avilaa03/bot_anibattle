const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const magnataRun = require('../actions/run/magnataRun');

module.exports = class MagnataSlashCommand extends BaseSlashCommand {
    constructor() {
        super('magnata');
    }

    async run(client, interaction) {
        await magnataRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.magnata.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.magnata.descricao'));
    }
};
