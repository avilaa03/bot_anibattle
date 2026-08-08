const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const rollRun = require('../actions/run/rollRun.js');
const rollCollect = require('../actions/collect/rollCollect.js');
const rollEnd = require('../actions/end/rollEnd.js');

module.exports = class RollSlashCommand extends BaseSlashCommand {
    constructor() {
        super('roll');
    }

    async run(client, interaction) {
        await rollRun(client, interaction, rollCollect, rollEnd);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.roll.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.roll.descricao'))
            .toJSON();
    }
};
