const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes, escolhasRaridade } = require('../utils/i18n');
const pokedexRun = require('../actions/run/pokedexRun.js');

module.exports = class PokedexSlashCommand extends BaseSlashCommand {
    constructor() {
        super('pokedex');
    }

    async run(client, interaction) {
        await pokedexRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.pokedex.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.pokedex.descricao'))
            .addStringOption(option =>
                option.setName('serie')
                    .setDescription(descricaoBase('comandos.pokedex.opcao_serie'))
                    .setDescriptionLocalizations(localizacoes('comandos.pokedex.opcao_serie'))
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('raridade')
                    .setDescription(descricaoBase('comandos.pokedex.opcao_raridade'))
                    .setDescriptionLocalizations(localizacoes('comandos.pokedex.opcao_raridade'))
                    .setRequired(false)
                    .addChoices(...escolhasRaridade())
            )
            .addBooleanOption(option =>
                option.setName('faltantes')
                    .setDescription(descricaoBase('comandos.pokedex.opcao_faltantes'))
                    .setDescriptionLocalizations(localizacoes('comandos.pokedex.opcao_faltantes'))
                    .setRequired(false)
            )
            .toJSON();
    }
};
