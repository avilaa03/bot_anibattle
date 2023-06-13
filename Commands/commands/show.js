const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const Card = require('../utils/cardSchema.js');
const { EmbedBuilder } = require("discord.js");
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
                const embed = new EmbedBuilder()
                .setTitle('Anime Fight')
            for(const card of cards) {
                let words = card.name.split(" ");
                if (words.length >= 2) {
                    words.splice(1);
                  }
                card.name = words.join(" ");
                embed.addFields(
                {name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1)},
                {name: "Série", value: card.series},
                {name: "Raridade", value: card.rarity}
                )
                .setImage(card.image);
            }

            return interaction.reply({embeds: [embed]});
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