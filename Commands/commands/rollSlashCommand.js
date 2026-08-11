const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const rollRun = require('../actions/run/rollRun.js');
const rollCollect = require('../actions/collect/rollCollect.js');
const rollEnd = require('../actions/end/rollEnd.js');
const { descricaoBase, localizacoes } = require('../utils/i18n.js');

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
            // Opcional e falso por padrão: gastar um roll extra sem querer
            // seria perder algo que custou moeda. Só quem digita `extra`
            // de propósito gasta.
            .addBooleanOption((opt) => opt
                .setName('extra')
                .setDescription(descricaoBase('comandos.roll.opcao_extra'))
                .setDescriptionLocalizations(localizacoes('comandos.roll.opcao_extra')))
            .toJSON();
    }
};
