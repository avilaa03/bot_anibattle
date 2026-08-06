const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const eventoRun = require('../actions/run/eventoRun.js');

module.exports = class EventoSlashCommand extends BaseSlashCommand {
    constructor() {
        super('evento');
    }

    async run(client, interaction) {
        await eventoRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Vê os eventos abertos e entra neles')
            .addSubcommand((sub) => sub
                .setName('lista')
                .setDescription('Mostra os eventos com inscrição aberta'))
            .addSubcommand((sub) => sub
                .setName('entrar')
                .setDescription('Entra num evento aberto')
                .addStringOption((opt) => opt
                    .setName('nome')
                    .setDescription('O nome exato do evento, como aparece em /evento lista')
                    .setRequired(true)))
            .toJSON();
    }
};
