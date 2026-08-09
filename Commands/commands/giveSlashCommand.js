const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
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
            .setDescription(descricaoBase('comandos.give.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.give.descricao'))
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription(descricaoBase('comandos.give.opcao_user'))
                    .setDescriptionLocalizations(localizacoes('comandos.give.opcao_user'))
                    .setRequired(true))
            .addNumberOption(option =>
                option
                    .setName('amount')
                    .setDescription(descricaoBase('comandos.give.opcao_amount'))
                    .setDescriptionLocalizations(localizacoes('comandos.give.opcao_amount'))
                    .setMinValue(0)
                    .setMaxValue(9999999999)
                    .setRequired(true));
    }
}
