const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const desejarRun = require('../actions/run/wishRun.js');

module.exports = class WishSlashCommand extends BaseSlashCommand {
    constructor() {
        super('wish');
    }

    async run(client, interaction) {
        await desejarRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.desejar.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.desejar.descricao'))
            .addStringOption(option =>
                option.setName('name')
                .setNameLocalizations(nomes.opcao('name'))
                    .setDescription(descricaoBase('comandos.desejar.opcao_nome'))
                    .setDescriptionLocalizations(localizacoes('comandos.desejar.opcao_nome'))
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('number')
                .setNameLocalizations(nomes.opcao('number'))
                    .setDescription(descricaoBase('comandos.desejar.opcao_numero'))
                    .setDescriptionLocalizations(localizacoes('comandos.desejar.opcao_numero'))
                    .setMinValue(1)
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName('remove')
                .setNameLocalizations(nomes.opcao('remove'))
                    .setDescription(descricaoBase('comandos.desejar.opcao_remover'))
                    .setDescriptionLocalizations(localizacoes('comandos.desejar.opcao_remover'))
                    .setRequired(false)
            )
            .toJSON();
    }
};
