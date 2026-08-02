const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const trocarRun = require('../actions/run/trocarRun.js');

module.exports = class TrocarSlashCommand extends BaseSlashCommand {
    constructor() {
        super('trocar');
    }

    async run(client, interaction) {
        await trocarRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Propõe uma troca de cartas com outro jogador')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Com quem você quer trocar')
                    .setRequired(true)
            )
            .toJSON();
    }
};
