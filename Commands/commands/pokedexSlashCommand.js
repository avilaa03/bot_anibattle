const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/commandNames.js');
const { SlashCommandBuilder } = require('discord.js');
const pokedexRun = require('../actions/run/pokedexRun.js');
const { descricaoBase, localizacoes, escolha, escolhasRaridade } = require('../utils/i18n.js');

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
                option.setName('series')
                .setNameLocalizations(nomes.opcao('series'))
                    .setDescription(descricaoBase('comandos.pokedex.opcao_serie'))
                    .setDescriptionLocalizations(localizacoes('comandos.pokedex.opcao_serie'))
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('dex')
                    .setDescription(descricaoBase('comandos.pokedex.opcao_dex'))
                    .setDescriptionLocalizations(localizacoes('comandos.pokedex.opcao_dex'))
                    .setRequired(false)
                    .addChoices(
                        escolha('comandos.pokedex.dex_normal', 'normal'),
                        escolha('comandos.pokedex.dex_evento', 'evento')
                    )
            )
            .addStringOption(option =>
                option.setName('rarity')
                .setNameLocalizations(nomes.opcao('rarity'))
                    .setDescription(descricaoBase('comandos.pokedex.opcao_raridade'))
                    .setDescriptionLocalizations(localizacoes('comandos.pokedex.opcao_raridade'))
                    .setRequired(false)
                    // As cinco raridades já vêm prontas do i18n, com emoji e
                    // os dois idiomas — a mesma lista que o /market usa.
                    .addChoices(...escolhasRaridade())
            )
            .addBooleanOption(option =>
                option.setName('missing')
                .setNameLocalizations(nomes.opcao('missing'))
                    .setDescription(descricaoBase('comandos.pokedex.opcao_faltantes'))
                    .setDescriptionLocalizations(localizacoes('comandos.pokedex.opcao_faltantes'))
                    .setRequired(false)
            )
            .toJSON();
    }
};
