const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const balanceRun = require('../actions/run/balanceRun');

module.exports = class BalanceSlashCommand extends BaseSlashCommand {
    constructor() {
        super('balance');
    }

    async run(client, interaction) {
        await balanceRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra a quantidade de moedas do usuário')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('Usuário que deseja mencionar')
                    .setRequired(false));
    }
}
