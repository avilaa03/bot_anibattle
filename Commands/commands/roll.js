const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const cron = require('node-cron');
const Card = require('../utils/cardSchema.js');
const User = require('../utils/userSchema.js')

module.exports = class RollSlashCommand extends BaseSlashCommand {
    constructor() {
        super('roll');
    }

    run(client, interaction) {
    User.findOne({ id: interaction.user.id }, (err, user) => {
        if (err) {
            return message.reply('Houve um erro ao buscar as informações do usuário.');
        }
        
        const now = Date.now();
        if (user && user.lastRoll && now - user.lastRoll < 15 * 60 * 1000) {
            return interaction.reply('Você só pode rolar uma vez a cada 15 minutos.');
        }
        
        Card.countDocuments({}, (err, count) => {
        if (err) {
            return interaction.reply('Houve um erro ao buscar as informações das cartas.');
        }
        
        const randomIndex = Math.floor(Math.random() * count);
        Card.findOne().skip(randomIndex).exec((err, card) => {
        if (err) {
            return interaction.reply('Houve um erro ao buscar as informações da carta.');
        }
        
        let reply = '';
        reply += `Nome: ${card.name}\n`;
        reply += `Imagem: ${card.image}\n`;
        reply += `Raridade: ${card.rarity}\n`;
        
        interaction.reply(reply);
        
        if (!user) {
            user = new User({ id: interaction.user.id });
        }
            user.lastRoll = now;
            user.save();
    });
 });
 });
};
    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('roll command')
        .toJSON();
    }
}