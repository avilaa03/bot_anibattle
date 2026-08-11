const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/commandNames.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const fichaRun = require('../actions/run/cardinfoRun.js');

module.exports = class CardinfoSlashCommand extends BaseSlashCommand {
    constructor() {
        super('cardinfo');
    }

    async run(client, interaction) {
        await fichaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.ficha.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.ficha.descricao'))
            .addStringOption(option =>
                option.setName('name')
                .setNameLocalizations(nomes.opcao('name'))
                    .setDescription(descricaoBase('comandos.ficha.opcao_nome'))
                    .setDescriptionLocalizations(localizacoes('comandos.ficha.opcao_nome'))
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('number')
                .setNameLocalizations(nomes.opcao('number'))
                    .setDescription(descricaoBase('comandos.ficha.opcao_numero'))
                    .setDescriptionLocalizations(localizacoes('comandos.ficha.opcao_numero'))
                    .setMinValue(1)
                    .setRequired(false)
            )
            .toJSON();
    }
};
