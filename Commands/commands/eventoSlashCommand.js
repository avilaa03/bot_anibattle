const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const eventoRun = require('../actions/run/eventoRun.js');
const { descricaoBase, localizacoes } = require('../utils/i18n.js');

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
            .setDescription(descricaoBase('comandos.evento.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.evento.descricao'))
            .addSubcommand((sub) => sub
                .setName('lista')
                .setDescription(descricaoBase('comandos.evento.sub_lista'))
                .setDescriptionLocalizations(localizacoes('comandos.evento.sub_lista')))
            .addSubcommand((sub) => sub
                .setName('entrar')
                .setDescription(descricaoBase('comandos.evento.sub_entrar'))
                .setDescriptionLocalizations(localizacoes('comandos.evento.sub_entrar'))
                .addStringOption((opt) => opt
                    .setName('nome')
                    .setDescription(descricaoBase('comandos.evento.opcao_nome'))
                    .setDescriptionLocalizations(localizacoes('comandos.evento.opcao_nome'))
                    .setRequired(true)))
            .toJSON();
    }
};
