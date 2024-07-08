const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Card = require('../utils/cardSchema.js');
const User = require('../utils/userSchema.js');

module.exports = class RollSlashCommand extends BaseSlashCommand {
    constructor() {
        super('roll');
    }

    run(client, interaction) {
        User.findOne({ id: interaction.user.id }, (err, user) => {
            if (err) {
                console.error('Erro ao buscar as informações do usuário:', err);
                return interaction.reply('Houve um erro ao buscar as informações do usuário.');
            }

            const now = Date.now();

            if (user && user.lastRoll && now - user.lastRoll < 1 * 60 * 1000) {
                return interaction.reply('Você só pode rolar uma vez a cada 1 minuto.');
            }

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

            console.log(`Raridade sorteada: ${rarity}`);

            Card.countDocuments({}, (err, count) => {
                if (err) {
                    console.error('Erro ao contar os documentos das cartas:', err);
                    return interaction.reply('Houve um erro ao buscar as informações das cartas.');
                }

                Card.findOne({ rarity: rarity }).exec((err, card) => {
                    if (err) {
                        console.error('Erro ao buscar a carta:', err);
                        return interaction.reply('Houve um erro ao buscar as informações da carta.');
                    }

                    if (!card) {
                        console.warn('Nenhuma carta encontrada com a raridade especificada:', rarity);
                        // Fallback para buscar uma carta aleatória se nenhuma carta for encontrada com a raridade especificada
                        Card.findOne().exec((err, fallbackCard) => {
                            if (err || !fallbackCard) {
                                console.error('Erro ao buscar a carta de fallback:', err);
                                return interaction.reply('Houve um erro ao buscar as informações da carta.');
                            }

                            card = fallbackCard;
                            sendCardEmbed(card);
                        });
                    } else {
                        sendCardEmbed(card);
                    }
                });
            });

            const sendCardEmbed = (card) => {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('enviarInventario')
                            .setLabel('Enviar ao Inventário')
                            .setStyle(ButtonStyle.Primary)
                    );

                const embed = new EmbedBuilder()
                    .setTitle('Carta Sorteada')
                    .addFields(
                        { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                        { name: "Raridade", value: card.rarity }
                    )
                    .setImage(card.image);

                interaction.reply({ embeds: [embed], components: [row] });

                if (!user) {
                    user = new User({ id: interaction.user.id });
                }

                user.lastRoll = now;
                user.save();
            };
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('roll command')
            .toJSON();
    }
}
