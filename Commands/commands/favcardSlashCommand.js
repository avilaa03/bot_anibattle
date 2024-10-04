const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const favCardRun = require('../actions/run/favcardRun.js');
const favCardCollect = require('../actions/collect/favcardCollect.js');
const favCardEnd = require('../actions/end/favcardEnd.js');

module.exports = class FavCardSlashCommand extends BaseSlashCommand {
    constructor() {
        super('favcard');
    }

    async run(client, interaction) {
        await favCardRun(client, interaction, favCardCollect, favCardEnd);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Favorita uma carta')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('O nome da carta que você quer favoritar')
                    .setRequired(true)
            );
    }
};
