const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Card = require('../utils/cardSchema.js');
const User = require('../utils/userSchema.js');
const mongoose = require('mongoose');

module.exports = class RollSlashCommand extends BaseSlashCommand {
    constructor() {
        super('roll');
    }

    async run(client, interaction) {
        User.findOne({ id: interaction.user.id }, (err, user) => {
            if (err) {
                console.error('Erro ao buscar as informações do usuário:', err);
                return interaction.reply('Houve um erro ao buscar as informações do usuário.');
            }

            const now = Date.now();

            if (user && user.lastRoll && now - user.lastRoll < 1 * 60 * 1000) {
                const timeElapsed = now - user.lastRoll;
                const timeRemaining = 1 * 60 * 1000 - timeElapsed;
            
                const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
                return interaction.reply(`Você só pode rolar uma vez a cada 1 minuto (TEMPO DE TESTES). Faltam ${seconds} segundos para você roletar novamente.`);
            }

            // if (user && user.lastRoll && now - user.lastRoll < 15 * 60 * 1000) {
            //     const timeElapsed = now - user.lastRoll;
            //     const timeRemaining = 15 * 60 * 1000 - timeElapsed;
            
            //     const minutes = Math.floor(timeRemaining / (60 * 1000));
            //     const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
            //     return interaction.reply(`Você só pode rolar uma vez a cada 15 minutos. Faltam ${minutes} minutos e ${seconds} segundos para você roletar novamente.`);
            // }

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
                        return interaction.reply('Nenhuma carta encontrada com a raridade especificada.');
                    }

                    const marketValue = (card.ata + card.int + card.def + card.des + card.pow + card.res) * 10;
                    const valueToSell = marketValue / 2;

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`enviarInventario_${card._id}_${interaction.user.id}`)
                                .setLabel('Enviar ao Inventário')
                                .setStyle(ButtonStyle.Primary)
                        )
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`vender_${card._id}_${interaction.user.id}`)
                                .setLabel(`Vender por ${valueToSell} moedas`)
                                .setStyle(ButtonStyle.Secondary)
                        );

                    const embed = new EmbedBuilder()
                        .setTitle('Carta Sorteada')
                        .addFields(
                            { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                            { name: "Raridade", value: card.rarity },
                            { name: "Valor de Mercado", value: marketValue.toString() }
                        )
                        .setImage(card.image);

                    interaction.reply({ embeds: [embed], components: [row] });

                    if (!user) {
                        user = new User({ id: interaction.user.id });
                    }

                    user.lastRoll = now;
                    user.save();

                    const filter = (i) => (i.customId.startsWith(`enviarInventario_${card._id}`) || i.customId.startsWith(`vender_${card._id}`)) && i.user.id === interaction.user.id;
                    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });

                    collector.on('collect', async (i) => {
                        if (i.customId.startsWith('enviarInventario_')) {
                            const clonedCard = {
                                cardId: new mongoose.Types.ObjectId(),
                                originalCardId: card._id,
                                name: card.name,
                                series: card.series,
                                image: card.image,
                                rarity: card.rarity,
                                ovr: card.ovr,
                                ata: card.ata,
                                int: card.int,
                                def: card.def,
                                des: card.des,
                                pow: card.pow,
                                res: card.res,
                                obtainedAt: new Date(),
                                marketValue: marketValue,
                                valueToSell: valueToSell
                            };

                            user.inventory.push(clonedCard);
                            await user.save();
                            await i.update({ content: 'Carta enviada ao seu inventário!', components: [] });
                        } else if (i.customId.startsWith('vender_')) {
                            user.balance += valueToSell;
                            await user.save();
                            await i.update({ content: `Você vendeu a carta por ${valueToSell} moedas!`, components: [] });
                        }
                        collector.stop('collected');
                    });

                    collector.on('end', (collected, reason) => {
                        if (reason === 'time') {
                            interaction.followUp({ content: 'O tempo para coletar a carta expirou.', components: [] });
                        }
                    });
                });
            });
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('roll command')
            .toJSON();
    }
}
