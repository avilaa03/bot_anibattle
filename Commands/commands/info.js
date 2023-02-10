const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');

module.exports = class PingSlashCommand extends BaseSlashCommand {
    constructor() {
        super('info');
    }

    run(client, interaction) {
        return interaction.reply({ content: 'Olá! Sou um bot de Batalhas de Personagens de Animes em desenvolvimento, criado por <@282895755688280065>, por enquanto sou totalmente OpenSource, e você pode olhar o meu repositório em https://github.com/avilaa03/bot_animefight'});
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('info command')
        .toJSON();
    }
}