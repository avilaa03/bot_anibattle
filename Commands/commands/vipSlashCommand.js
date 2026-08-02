const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
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
            .setDescription('Mostra os planos VIP e o status da sua assinatura')
            .toJSON();
    }
};
