const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const desejarRun = require('../actions/run/desejarRun.js');

module.exports = class DesejarSlashCommand extends BaseSlashCommand {
    constructor() {
        super('desejar');
    }

    async run(client, interaction) {
        await desejarRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Adiciona uma carta à sua lista de desejos (ou remove)')
            .addStringOption(option =>
                option.setName('nome')
                    .setDescription('Nome da carta')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('numero')
                    .setDescription('Número da carta na Pokédex')
                    .setMinValue(1)
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName('remover')
                    .setDescription('Marque para tirar a carta da lista')
                    .setRequired(false)
            )
            .toJSON();
    }
};
