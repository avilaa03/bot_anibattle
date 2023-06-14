const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const cron = require('node-cron');
const Card = require('../utils/cardSchema.js');
const User = require('../utils/userSchema.js');
const { EmbedBuilder } = require('discord.js'); // Importa a classe MessageEmbed

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

        const rarities = [
            { rarity: 'Common', percentage: 70 },
            { rarity: 'Rare', percentage: 20 },
            { rarity: 'Ultra Rare', percentage: 8 },
            { rarity: 'Legendary', percentage: 1.5 },
            { rarity: 'Master', percentage: 0.5 }
          ];

        const random = Math.random() * 100;

        let accumulated = 0;
        let rarity;
        for (const r of rarities) {
        accumulated += r.percentage;
        if (random <= accumulated) {
        rarity = r.rarity;
        break;
         }
        } 
        
        Card.countDocuments({}, (err, count) => {
        if (err) {
            return interaction.reply('Houve um erro ao buscar as informações das cartas.');
        }
        
        // const randomIndex = Math.floor(Math.random() * count);
        Card.findOne({ rarity: rarity }).exec((err, card) => {
        if (err) {
            return interaction.reply('Houve um erro ao buscar as informações da carta.');
        }
        
        // Cria um objeto de embed e define a imagem da carta
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
                .setCustomId('primary')
                .setLabel('Enviar ao Inventário')
                .setStyle(ButtonStyle.Primary)
                
          )
        const embed = new EmbedBuilder()
          .setTitle('Carta Sorteada')
          .addFields({name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1)},
            {name: "Raridade", value: card.rarity})
          .setImage(card.image) // Define a imagem da carta usando o método setImage
          ;
          
        const primary = () => {
          interaction.send('ok');
        }

        interaction.reply({ embeds: [embed], components: [row] });

        
        // const filter = (interaction) => {
        //     return interaction.customId === 'add-to-inventory' && interaction.user.id === user.id;
        //   };

        // const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });

        // collector.on ('collect', async (interaction) => {
        //     if(!interaction.isButton()) return 
        //     const hashCode = generateHashCode();
        //     const inventoryItem = { card: card, hashCode: hashCode };
        //     interaction.user.inventory.push(inventoryItem);
        //     interaction.user.save();
        //     interaction.reply(`A carta "${card.name}" foi adicionada ao seu inventário com o hashcode ${hashCode}.`)
        
    // });
        
        
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