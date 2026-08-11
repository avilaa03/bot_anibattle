const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/commandNames.js');
const { SlashCommandBuilder } = require('discord.js');
const treinoRun = require('../actions/run/trainingRun.js');
const { DIFICULDADES } = require('../utils/training.js');
const { descricaoBase, localizacoes, escolha } = require('../utils/i18n.js');

module.exports = class TrainingSlashCommand extends BaseSlashCommand {
    constructor() {
        super('training');
    }

    async run(client, interaction) {
        await treinoRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.treino.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.treino.descricao'))
            .addStringOption(option =>
                option.setName('difficulty')
                .setNameLocalizations(nomes.opcao('difficulty'))
                    .setDescription(descricaoBase('comandos.treino.opcao_dificuldade'))
                    .setDescriptionLocalizations(localizacoes('comandos.treino.opcao_dificuldade'))
                    .addChoices(
                        ...Object.values(DIFICULDADES).map((d) =>
                            escolha(`treino_catalogo.dificuldades.${d.chave}`, d.chave, `${d.emoji} `))
                    )
                    .setRequired(false)
            )
            .toJSON();
    }
};
