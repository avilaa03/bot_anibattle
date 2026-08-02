const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const cosmeticosRun = require('../actions/run/cosmeticosRun.js');

module.exports = class CosmeticosSlashCommand extends BaseSlashCommand {
    constructor() {
        super('cosmeticos');
    }

    async run(client, interaction) {
        await cosmeticosRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Equipa suas molduras de carta e cor de perfil (exclusivo VIP)')
            .toJSON();
    }
};
