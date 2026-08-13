const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/commandNames.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const redeemRun = require('../actions/run/redeemRun.js');

module.exports = class RedeemSlashCommand extends BaseSlashCommand {
    constructor() {
        super('redeem');
    }

    async run(client, interaction) {
        await redeemRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.redeem.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.redeem.descricao'))
            .addStringOption(option =>
                option.setName('code')
                    .setNameLocalizations(nomes.opcao('code'))
                    .setDescription(descricaoBase('comandos.redeem.opcao_code'))
                    .setDescriptionLocalizations(localizacoes('comandos.redeem.opcao_code'))
                    .setRequired(true)
                    // Frouxo de propósito: o jogador cola com espaço, em
                    // minúscula ou sem os hífens, e `redeem.normalizar`
                    // conserta tudo isso. Apertar aqui recusaria códigos
                    // legítimos com uma mensagem do Discord que não explica
                    // nada — a validação de verdade é a do banco.
                    .setMinLength(8)
                    .setMaxLength(32)
            )
            .toJSON();
    }
};
