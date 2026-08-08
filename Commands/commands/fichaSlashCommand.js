const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const fichaRun = require('../actions/run/fichaRun.js');

module.exports = class FichaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('ficha');
    }

    async run(client, interaction) {
        await fichaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.ficha.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.ficha.descricao'))
            .addStringOption(option =>
                option.setName('nome')
                    .setDescription(descricaoBase('comandos.ficha.opcao_nome'))
                    .setDescriptionLocalizations(localizacoes('comandos.ficha.opcao_nome'))
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('numero')
                    .setDescription(descricaoBase('comandos.ficha.opcao_numero'))
                    .setDescriptionLocalizations(localizacoes('comandos.ficha.opcao_numero'))
                    .setMinValue(1)
                    .setRequired(false)
            )
            .toJSON();
    }
};
