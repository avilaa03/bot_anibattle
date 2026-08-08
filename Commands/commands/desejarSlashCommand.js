const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const desejarRun = require('../actions/run/desejarRun.js');

module.exports = class DesejarSlashCommand extends BaseSlashCommand {
    constructor() {
        super('desejar');
    }

    async run(client, interaction) {
        await desejarRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.desejar.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.desejar.descricao'))
            .addStringOption(option =>
                option.setName('nome')
                    .setDescription(descricaoBase('comandos.desejar.opcao_nome'))
                    .setDescriptionLocalizations(localizacoes('comandos.desejar.opcao_nome'))
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('numero')
                    .setDescription(descricaoBase('comandos.desejar.opcao_numero'))
                    .setDescriptionLocalizations(localizacoes('comandos.desejar.opcao_numero'))
                    .setMinValue(1)
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName('remover')
                    .setDescription(descricaoBase('comandos.desejar.opcao_remover'))
                    .setDescriptionLocalizations(localizacoes('comandos.desejar.opcao_remover'))
                    .setRequired(false)
            )
            .toJSON();
    }
};
