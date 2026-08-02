const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const desejosRun = require('../actions/run/desejosRun.js');

module.exports = class DesejosSlashCommand extends BaseSlashCommand {
    constructor() {
        super('desejos');
    }

    async run(client, interaction) {
        await desejosRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra sua lista de desejos')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Ver a lista de outro jogador')
                    .setRequired(false)
            )
            .toJSON();
    }
};
