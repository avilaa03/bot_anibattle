const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes, traduzir } = require('../utils/i18n');
const torneioRun = require('../actions/run/torneioRun.js');

module.exports = class TorneioSlashCommand extends BaseSlashCommand {
    constructor() {
        super('torneio');
    }

    async run(client, interaction) {
        await torneioRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.torneio.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.torneio.descricao'))
            .addStringOption(option =>
                option.setName('nome')
                    .setDescription(descricaoBase('comandos.torneio.opcao_nome'))
                    .setDescriptionLocalizations(localizacoes('comandos.torneio.opcao_nome'))
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('vagas')
                    .setDescription(descricaoBase('comandos.torneio.opcao_vagas'))
                    .setDescriptionLocalizations(localizacoes('comandos.torneio.opcao_vagas'))
                    .addChoices(
                        ...[4, 8, 16].map((n) => ({
                            name: traduzir('pt-BR', 'torneio.vagas_escolha', { n }),
                            name_localizations: { 'en-US': traduzir('en-US', 'torneio.vagas_escolha', { n }) },
                            value: n
                        }))
                    )
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('inscricao')
                    .setDescription(descricaoBase('comandos.torneio.opcao_inscricao'))
                    .setDescriptionLocalizations(localizacoes('comandos.torneio.opcao_inscricao'))
                    .setMinValue(0)
                    .setRequired(false)
            )
            .toJSON();
    }
};
