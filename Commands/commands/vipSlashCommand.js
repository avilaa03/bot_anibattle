const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const vipRun = require('../actions/run/vipRun.js');

module.exports = class VipSlashCommand extends BaseSlashCommand {
    constructor() {
        super('vip');
    }

    async run(client, interaction) {
        await vipRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.vip.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.vip.descricao'))
            .toJSON();
    }
};
