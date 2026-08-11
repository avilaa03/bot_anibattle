const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const favCardRun = require('../actions/run/favcardRun.js');
const favCardCollect = require('../actions/collect/favcardCollect.js');
const favCardEnd = require('../actions/end/favcardEnd.js');

module.exports = class FavCardSlashCommand extends BaseSlashCommand {
    constructor() {
        super('favcard');
    }

    async run(client, interaction) {
        await favCardRun(client, interaction, favCardCollect, favCardEnd);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.favcard.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.favcard.descricao'))
            .addStringOption(option =>
                option.setName('name')
                .setNameLocalizations(nomes.opcao('name'))
                    .setDescription(descricaoBase('comandos.favcard.opcao_name'))
                    .setDescriptionLocalizations(localizacoes('comandos.favcard.opcao_name'))
                    .setRequired(true)
            );
    }
};
