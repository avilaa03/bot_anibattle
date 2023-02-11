const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const Card = require('../utils/cardSchema.js');
const messageCountSchema = require('../../TestFiles/message-count-schema');
module.exports = class ShowSlashCommand extends BaseSlashCommand {
    constructor() {
        super('show');
    }

    run(client, interaction) {
        const name = interaction.options.getString('character').toLowerCase();
        Card.find({ name }, (err, cards) => {
            if (cards.length === 0 || err) {
                return interaction.reply('Personagem não encontrado');
            }
            else {
            let reply = '';
            for(const card of cards) {
                reply += `Nome: ${card.name}\n`;
                reply += `Imagem: ${card.image}\n`;
                reply += `Raridade: ${card.rarity}\n`;
                reply += `Ataque: ${card.attack}\n`;
                reply += `Defesa: ${card.defense}\n`;
                reply += `Vida: ${card.health}\n`;
                reply += `Poder: ${card.power}\n\n`;
            }

            return interaction.reply(reply);
        }
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('show card command')
        .addStringOption(option =>
            option
            .setName('character')
            .setDescription('Personagem que está procurando')
            .setRequired(true));
    }
}