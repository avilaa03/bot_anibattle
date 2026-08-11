const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const eventoRun = require('../actions/run/eventRun.js');
const { descricaoBase, localizacoes } = require('../utils/i18n.js');

module.exports = class EventSlashCommand extends BaseSlashCommand {
    constructor() {
        super('event');
    }

    async run(client, interaction) {
        await eventoRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.evento.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.evento.descricao'))
            .addSubcommand((sub) => sub
                .setName('list')
                .setNameLocalizations(nomes.subcomando('event', 'list'))
                .setDescription(descricaoBase('comandos.evento.sub_lista'))
                .setDescriptionLocalizations(localizacoes('comandos.evento.sub_lista')))
            .addSubcommand((sub) => sub
                .setName('join')
                .setNameLocalizations(nomes.subcomando('event', 'join'))
                .setDescription(descricaoBase('comandos.evento.sub_entrar'))
                .setDescriptionLocalizations(localizacoes('comandos.evento.sub_entrar'))
                .addStringOption((opt) => opt
                    .setName('name')
                    .setNameLocalizations(nomes.opcao('name'))
                    .setDescription(descricaoBase('comandos.evento.opcao_nome'))
                    .setDescriptionLocalizations(localizacoes('comandos.evento.opcao_nome'))
                    .setRequired(true)))
            .toJSON();
    }
};
