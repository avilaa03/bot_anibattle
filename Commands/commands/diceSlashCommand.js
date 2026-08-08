const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const diceRun = require("../actions/run/diceRun")


module.exports = class DiceSlashCommand extends BaseSlashCommand {
    constructor() {
        super('dice');
        
    }

    async run(client, interaction) {
        await diceRun(client, interaction)
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(descricaoBase('comandos.dice.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.dice.descricao'))
        .toJSON();
    }
}
