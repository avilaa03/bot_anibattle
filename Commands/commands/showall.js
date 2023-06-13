const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const Card = require('../utils/cardSchema.js');

module.exports = class ShowSlashCommand extends BaseSlashCommand {
    constructor() {
        super('showall');
    }

    run(client, interaction) {
        Card.find({ }, (err, cards) => {
            if (cards.length === 0 || err) {
                return interaction.reply('Personagem não encontrado');
            }
            else {
            let reply = '';
            for(const card of cards) {
                reply += `${card.number}: ${card.name.charAt(0).toUpperCase() + card.name.slice(1)}\n`;
            }

            return interaction.reply(reply);
        }
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('show all cards command')
        .toJSON();
    }
}