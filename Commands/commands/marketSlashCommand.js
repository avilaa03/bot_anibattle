const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes, escolhasRaridade } = require('../utils/i18n');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const marketRun = require('../actions/run/marketRun');
const marketCollect = require('../actions/collect/marketCollect');
const marketEnd = require('../actions/end/marketEnd');

module.exports = class MarketSlashCommand extends BaseSlashCommand {
    constructor() {
        super('market');
    }

    async run(client, interaction) {
        await marketRun(client, interaction, marketCollect, marketEnd);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.market.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.market.descricao'))
            .addStringOption(option => option.setName('cardname').setDescription(descricaoBase('comandos.market.opcao_cardname'))
                    .setDescriptionLocalizations(localizacoes('comandos.market.opcao_cardname')).setRequired(false))
            .addStringOption(option => option.setName('series').setDescription(descricaoBase('comandos.market.opcao_series'))
                    .setDescriptionLocalizations(localizacoes('comandos.market.opcao_series')).setRequired(false))
            .addStringOption(option =>
                option.setName('rarity').setDescription(descricaoBase('comandos.market.opcao_rarity'))
                    .setDescriptionLocalizations(localizacoes('comandos.market.opcao_rarity')).setRequired(false)
                    .addChoices(...escolhasRaridade()))
            .addIntegerOption(option => option.setName('minvalue').setDescription(descricaoBase('comandos.market.opcao_minvalue'))
                    .setDescriptionLocalizations(localizacoes('comandos.market.opcao_minvalue')).setRequired(false))
            .addIntegerOption(option => option.setName('maxvalue').setDescription(descricaoBase('comandos.market.opcao_maxvalue'))
                    .setDescriptionLocalizations(localizacoes('comandos.market.opcao_maxvalue')).setRequired(false));
    }
};
