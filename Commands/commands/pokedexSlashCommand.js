const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const pokedexRun = require('../actions/run/pokedexRun.js');

module.exports = class PokedexSlashCommand extends BaseSlashCommand {
    constructor() {
        super('pokedex');
    }

    async run(client, interaction) {
        await pokedexRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra quais cartas você já descobriu e quais ainda faltam')
            .addStringOption(option =>
                option.setName('serie')
                    .setDescription('Filtrar por anime/série')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('raridade')
                    .setDescription('Filtrar por raridade')
                    .setRequired(false)
                    .addChoices(
                        { name: '⚪ Comum', value: 'common' },
                        { name: '🔵 Rara', value: 'rare' },
                        { name: '🟣 Ultra Rara', value: 'ultra rare' },
                        { name: '🟠 Lendária', value: 'legendary' },
                        { name: '🌟 Mestra', value: 'master' }
                    )
            )
            .addBooleanOption(option =>
                option.setName('faltantes')
                    .setDescription('Mostrar apenas as cartas que você ainda não tem')
                    .setRequired(false)
            )
            .toJSON();
    }
};
