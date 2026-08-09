const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const profileRun = require('../actions/run/profileRun.js')

module.exports = class ProfileSlashCommand extends BaseSlashCommand {
    constructor() {
        super('profile');
    }

    async run(client, interaction) {
        await profileRun(client, interaction)
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.profile.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.profile.descricao'))
            .addUserOption(option =>
                option.setName('user')
                    .setDescription(descricaoBase('comandos.profile.opcao_user'))
                    .setDescriptionLocalizations(localizacoes('comandos.profile.opcao_user'))
                    .setRequired(false)
            );
    }
};
