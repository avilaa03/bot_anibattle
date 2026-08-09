const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
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
            .setDescription(descricaoBase('comandos.balance.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.balance.descricao'))
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription(descricaoBase('comandos.balance.opcao_user'))
                    .setDescriptionLocalizations(localizacoes('comandos.balance.opcao_user'))
                    .setRequired(false));
    }
}
