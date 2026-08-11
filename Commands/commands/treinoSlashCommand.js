const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const treinoRun = require('../actions/run/treinoRun.js');
const { DIFICULDADES } = require('../utils/treino.js');
const { descricaoBase, localizacoes, escolha } = require('../utils/i18n.js');

module.exports = class TreinoSlashCommand extends BaseSlashCommand {
    constructor() {
        super('treino');
    }

    async run(client, interaction) {
        await treinoRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.treino.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.treino.descricao'))
            .addStringOption(option =>
                option.setName('dificuldade')
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
