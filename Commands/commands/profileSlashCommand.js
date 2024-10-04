const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
            .setDescription('Mostra o perfil do usuário com informações do inventário');
    }
};
