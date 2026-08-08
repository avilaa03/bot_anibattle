const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const rankingRun = require('../actions/run/rankingRun.js');

module.exports = class RankingSlashCommand extends BaseSlashCommand {
    constructor() {
        super('ranking');
    }

    async run(client, interaction) {
        await rankingRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.ranking.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.ranking.descricao'))
            .toJSON();
    }
};
