const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/commandNames.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const conquistasRun = require('../actions/run/achievementsRun.js');

module.exports = class AchievementsSlashCommand extends BaseSlashCommand {
    constructor() {
        super('achievements');
    }

    async run(client, interaction) {
        await conquistasRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.conquistas.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.conquistas.descricao'))
            .addUserOption(option =>
                option.setName('user')
                    .setDescription(descricaoBase('comandos.conquistas.opcao_user'))
                    .setDescriptionLocalizations(localizacoes('comandos.conquistas.opcao_user'))
                    .setRequired(false)
            )
            .toJSON();
    }
};
