const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const treinoRun = require('../actions/run/treinoRun.js');
const { DIFICULDADES } = require('../utils/treino.js');

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
            .setDescription('Batalha simulada contra o BOT Caviar — não vale moeda, ELO nem conquista')
            .addStringOption(option =>
                option.setName('dificuldade')
                    .setDescription('Quão forte é o adversário (padrão: parelho)')
                    .addChoices(
                        ...Object.values(DIFICULDADES).map((d) => ({
                            name: `${d.emoji} ${d.nome}`,
                            value: d.chave
                        }))
                    )
                    .setRequired(false)
            )
            .toJSON();
    }
};
