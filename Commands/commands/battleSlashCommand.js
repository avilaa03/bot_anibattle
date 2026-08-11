const BaseSlashCommand = require("../utils/BaseSlashCommand.js");
const nomes = require('../utils/commandNames.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes, traduzir } = require('../utils/i18n');
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

        const { userX, userY, userXData, userYData, challengeMessage, wager, t } = resultado;

        const collector = await battleCollect(interaction, userX, userY, userXData, userYData, challengeMessage, wager, t);

        battleEnd(collector, interaction, userY, t);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.battle.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.battle.descricao'))
            .addUserOption(option =>
                option.setName('user')
                    .setDescription(descricaoBase('comandos.battle.opcao_user'))
                    .setDescriptionLocalizations(localizacoes('comandos.battle.opcao_user'))
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('wager')
                .setNameLocalizations(nomes.opcao('wager'))
                    // Esta descrição tem o valor mínimo dentro do texto, então
                    // não dá para usar descricaoBase() direto — cada idioma
                    // precisa da interpolação feita nele mesmo.
                    .setDescription(traduzir('pt-BR', 'comandos.battle.opcao_aposta', { minimo: MIN_WAGER }))
                    .setDescriptionLocalizations({
                        'en-US': traduzir('en-US', 'comandos.battle.opcao_aposta', { minimo: MIN_WAGER })
                    })
                    .setMinValue(MIN_WAGER)
                    .setMaxValue(1000000)
                    .setRequired(false)
            )
            .toJSON();
    }
};
