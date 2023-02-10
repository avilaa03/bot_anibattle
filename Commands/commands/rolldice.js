const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');

function rollDice() {
    return 1 + Math.floor(Math.random() * 6);
}


module.exports = class RollDiceSlashCommand extends BaseSlashCommand {
    constructor() {
        super('rolldice');
        
    }

    run(client, interaction) {
        const dice = rollDice();
        return interaction.reply({ content: String(dice) })

    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('roll dice command')
        .toJSON();
    }
}
