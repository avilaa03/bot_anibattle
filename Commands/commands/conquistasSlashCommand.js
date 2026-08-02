const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const conquistasRun = require('../actions/run/conquistasRun.js');

module.exports = class ConquistasSlashCommand extends BaseSlashCommand {
    constructor() {
        super('conquistas');
    }

    async run(client, interaction) {
        await conquistasRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra seus troféus e o que falta para platinar')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Ver os troféus de outro jogador')
                    .setRequired(false)
            )
            .toJSON();
    }
};
