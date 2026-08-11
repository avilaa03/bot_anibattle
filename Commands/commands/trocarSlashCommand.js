const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const trocarRun = require('../actions/run/trocarRun.js');

module.exports = class TrocarSlashCommand extends BaseSlashCommand {
    constructor() {
        super('trade');
    }

    async run(client, interaction) {
        await trocarRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.trocar.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.trocar.descricao'))
            .addUserOption(option =>
                option.setName('user')
                    .setDescription(descricaoBase('comandos.trocar.opcao_user'))
                    .setDescriptionLocalizations(localizacoes('comandos.trocar.opcao_user'))
                    .setRequired(true)
            )
            .toJSON();
    }
};
