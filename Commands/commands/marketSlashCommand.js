const { SlashCommandBuilder } = require('discord.js');
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
            .setDescription('Procura por cartas no mercado e permite a compra')
            .addStringOption(option => option.setName('cardname').setDescription('Nome da carta').setRequired(false))
            .addIntegerOption(option => option.setName('minvalue').setDescription('Valor mínimo').setRequired(false))
            .addIntegerOption(option => option.setName('maxvalue').setDescription('Valor máximo').setRequired(false))
            .addStringOption(option => option.setName('rarity').setDescription('Raridade da carta').setRequired(false));
    }
};
