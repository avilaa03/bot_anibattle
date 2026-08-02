const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const fichaRun = require('../actions/run/fichaRun.js');

module.exports = class FichaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('ficha');
    }

    async run(client, interaction) {
        await fichaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Consulta a ficha de uma carta que você já registrou na Pokédex')
            .addStringOption(option =>
                option.setName('nome')
                    .setDescription('Nome da carta (ex: Kirito)')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('numero')
                    .setDescription('Número da carta na Pokédex (ex: 42)')
                    .setMinValue(1)
                    .setRequired(false)
            )
            .toJSON();
    }
};
