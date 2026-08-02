const BaseSlashCommand = require("../utils/BaseSlashCommand.js");
const { SlashCommandBuilder } = require('discord.js');
const { battleRun } = require('../actions/run/battleRun.js');
const { battleCollect } = require('../actions/collect/battleCollect.js');
const { battleEnd } = require('../actions/end/battleEnd.js');
const { MIN_WAGER } = require('../utils/economy.js');

module.exports = class BattleSlashCommand extends BaseSlashCommand {
    constructor() {
        super('battle');
    }

    async run(client, interaction) {
        const resultado = await battleRun(interaction);
        // battleRun devolve undefined quando recusa o desafio (sem saldo,
        // em cooldown, sem cartas...). Sem esta guarda, o destructuring
        // abaixo estouraria um TypeError.
        if (!resultado) return;

        const { userX, userY, userXData, userYData, challengeMessage, wager } = resultado;

        const collector = await battleCollect(interaction, userX, userY, userXData, userYData, challengeMessage, wager);

        battleEnd(collector, interaction, userY);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Desafie outro jogador para um duelo 3v3 apostando moedas')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('O jogador que você quer desafiar')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('aposta')
                    .setDescription(`Quanto apostar (mínimo ${MIN_WAGER}). O vencedor leva o dobro.`)
                    .setMinValue(MIN_WAGER)
                    .setMaxValue(1000000)
                    .setRequired(false)
            )
            .toJSON();
    }
};
