const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const missoesRun = require('../actions/run/missoesRun.js');

module.exports = class MissoesSlashCommand extends BaseSlashCommand {
    constructor() {
        super('missoes');
    }

    async run(client, interaction) {
        await missoesRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Suas missões diárias e semanais, e o resgate das recompensas')
            .toJSON();
    }
};
