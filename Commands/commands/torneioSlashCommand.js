const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
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
            .setDescription('Cria um torneio eliminatório no servidor')
            .addStringOption(option =>
                option.setName('nome')
                    .setDescription('Nome do torneio')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('vagas')
                    .setDescription('Quantas vagas (4, 8 ou 16)')
                    .addChoices(
                        { name: '4 vagas', value: 4 },
                        { name: '8 vagas', value: 8 },
                        { name: '16 vagas', value: 16 }
                    )
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('inscricao')
                    .setDescription('Taxa de inscrição em moedas (vira prêmio do campeão)')
                    .setMinValue(0)
                    .setRequired(false)
            )
            .toJSON();
    }
};
