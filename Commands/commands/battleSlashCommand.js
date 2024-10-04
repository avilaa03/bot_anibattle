const BaseSlashCommand = require("../utils/BaseSlashCommand.js");
const { SlashCommandBuilder } = require('discord.js');
const { battleRun } = require('../actions/run/battleRun.js');
const { battleCollect } = require('../actions/collect/battleCollect.js');
const { battleEnd } = require('../actions/end/battleEnd.js');

module.exports = class BattleSlashCommand extends BaseSlashCommand {
    constructor() {
        super('battle');
    }

    async run(client, interaction) {
        const { userX, userY, userXData, userYData, challengeMessage } = await battleRun(interaction);

        const collector = await battleCollect(interaction, userX, userY, userXData, userYData, challengeMessage);

        battleEnd(collector, interaction, userY);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Desafie outro usuário para uma batalha')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('O usuário que você deseja desafiar')
                    .setRequired(true)
            );
    }
};
