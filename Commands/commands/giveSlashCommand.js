const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const { giveRun } = require('../actions/run/giveRun.js');

module.exports = class GiveSlashCommand extends BaseSlashCommand {
    constructor() {
        super('give');
    }

    async run(client, interaction) {
        await giveRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Dá moedas para outro usuário')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('Usuário que deseja mencionar')
                    .setRequired(true))
            .addNumberOption(option =>
                option
                    .setName('amount')
                    .setDescription('Quantidade de dinheiro')
                    .setMinValue(0)
                    .setMaxValue(9999999999)
                    .setRequired(true));
    }
}
