const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const showRun = require('../actions/run/showRun');

module.exports = class ShowSlashCommand extends BaseSlashCommand {
    constructor() {
        super('show');
    }

    async run(client, interaction) {
        await showRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.show.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.show.descricao'))
            .addStringOption(option =>
                option.setName('name')
                    .setDescription(descricaoBase('comandos.show.opcao_name'))
                    .setDescriptionLocalizations(localizacoes('comandos.show.opcao_name'))
                    .setRequired(true)
            );
    }
};
