const CardBuilder = require('../../utils/cardBuilder');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
let currentCollector = null;

module.exports = async (client, interaction, rollCollect, rollEnd) => {
    User.findOne({ id: interaction.user.id }, async (err, user) => {
        if (err) {
            console.error('Erro ao buscar as informações do usuário:', err);
            return interaction.reply('Houve um erro ao buscar as informações do usuário.');
        }

        const now = Date.now();

        if (user && user.lastRoll && now - user.lastRoll < 15 * 60 * 1000) {
            const timeElapsed = now - user.lastRoll;
            const timeRemaining = 15 * 60 * 1000 - timeElapsed;

            const minutes = Math.floor(timeRemaining / (60 * 1000));
            const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
            return interaction.reply(`Você só pode rolar uma vez a cada 15 minutos. Faltam ${minutes} minutos e ${seconds} segundos para você roletar novamente.`);
        }

        const rarities = [
            { rarity: 'common', percentage: 55 },
            { rarity: 'rare', percentage: 28 },
            { rarity: 'ultra rare', percentage: 12 },
            { rarity: 'legendary', percentage: 4 },
            { rarity: 'master', percentage: 1 }
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
        if (!rarity) rarity = 'common';

        let cards = await Card.find({ rarity: rarity }).exec();
        if (!cards || cards.length === 0) {
            cards = await Card.find({ rarity: 'common' }).exec();
        }
        if (!cards || cards.length === 0) {
            return interaction.reply('Nenhuma carta encontrada no banco de dados.');
        }

        const card = cards[Math.floor(Math.random() * cards.length)];
        const marketValue = card.overall * 10;
        const valueToSell = marketValue / 2;

        const cardBuilder = new CardBuilder(card)
        const cardImageBuffer = await cardBuilder.build();

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
                { name: "Nome", value: card.name },
                { name: "Raridade", value: card.rarity },
                { name: "Valor de Mercado", value: marketValue.toString() }
            )
            .setImage('attachment://cardImage.png');

        interaction.reply({ embeds: [embed], components: [row], files: [{ attachment: cardImageBuffer, name: 'cardImage.png' }] });

        if (!user) {
            user = new User({ id: interaction.user.id });
        }

        user.lastRoll = now;
        await user.save();

        if (currentCollector) {
            currentCollector.stop();
        }

        currentCollector = rollCollect(interaction, card, user, marketValue, valueToSell, rollEnd);
    });
};
