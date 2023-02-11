const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');

function Dice() {
    return 1 + Math.floor(Math.random() * 6);
}


module.exports = class DiceSlashCommand extends BaseSlashCommand {
    constructor() {
        super('dice');
        
    }

    run(client, interaction) {
        const dice = Dice();
        return interaction.reply({ content: String(dice) })

    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('roll dice command')
        .toJSON();
    }
}
