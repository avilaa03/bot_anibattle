const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const undosellRun = require('../actions/run/undosellRun')

module.exports = class UndoSellSlashCommand extends BaseSlashCommand {
    constructor() {
        super('undosell');
    }

    async run(client, interaction) {
        await undosellRun(client, interaction)
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.undosell.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.undosell.descricao'))
            .addStringOption(option => option.setName('cardname').setDescription(descricaoBase('comandos.undosell.opcao_cardname'))
                    .setDescriptionLocalizations(localizacoes('comandos.undosell.opcao_cardname')).setRequired(true));
    }
};
