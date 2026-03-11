const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const rankingRun = require('../actions/run/rankingRun');

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
            .setDescription('Mostra o ranking de jogadores (vitórias ou moedas)')
            .addStringOption(option =>
                option
                    .setName('tipo')
                    .setDescription('Ranking por vitórias ou por moedas')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Vitórias em batalhas', value: 'battles' },
                        { name: 'Moedas', value: 'coins' }
                    ));
    }
};
