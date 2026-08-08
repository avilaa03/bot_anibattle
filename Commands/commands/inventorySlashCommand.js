const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const inventoryRun = require('../actions/run/inventoryRun.js');
const inventoryCollect = require('../actions/collect/inventoryCollect.js');
const inventoryEnd = require('../actions/end/inventoryEnd.js');

module.exports = class InventorySlashCommand extends BaseSlashCommand {
    constructor() {
        super('inventory');
    }

    async run(client, interaction) {
        await inventoryRun(client, interaction, inventoryCollect, inventoryEnd);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.inventory.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.inventory.descricao'));
    }
};
