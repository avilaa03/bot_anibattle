const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../utils/userSchema.js');

module.exports = class QuickSellSlashCommand extends BaseSlashCommand {
    constructor() {
        super('quicksell');
    }

    async run(client, interaction) {
        const name = interaction.options.getString('name').toLowerCase();

        const user = await User.findOne({ id: interaction.user.id });

        if (!user || user.inventory.length === 0) {
            return interaction.reply('Seu inventário está vazio ou o usuário não foi encontrado.');
        }

        const matchingCards = user.inventory.filter(c => c.name.toLowerCase().includes(name));

        if (matchingCards.length === 0) {
            return interaction.reply('Nenhuma carta encontrada com esse nome.');
        }

        let currentIndex = 0;

        const updateEmbed = () => {
            const card = matchingCards[currentIndex];
            const embed = new EmbedBuilder()
                .setTitle('Anime Fight')
                .setImage(card.image)
                .addFields(
                    { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                    { name: "Raridade", value: card.rarity },
                    { name: "Valor de Venda", value: `${card.valueToSell} moedas` }
                );

            return embed;
        };

        const rowNavigation = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Anterior')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(matchingCards.length === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Próximo')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(matchingCards.length === 1)
            );

        const rowConfirmation = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_sell')
                    .setLabel(`Vender por ${matchingCards[currentIndex].valueToSell} moedas`)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('cancel_sell')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Secondary)
            );

        const message = await interaction.reply({
            embeds: [updateEmbed()],
            components: [rowNavigation, rowConfirmation],
            fetchReply: true
        });

        const filter = i => ['prev', 'next', 'confirm_sell', 'cancel_sell'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
            if (i.customId === 'prev') {
                currentIndex = (currentIndex - 1 + matchingCards.length) % matchingCards.length;
                await i.update({ embeds: [updateEmbed()], components: [rowNavigation, rowConfirmation] });
            } else if (i.customId === 'next') {
                currentIndex = (currentIndex + 1) % matchingCards.length;
                await i.update({ embeds: [updateEmbed()], components: [rowNavigation, rowConfirmation] });
            } else if (i.customId === 'confirm_sell') {
                const card = matchingCards[currentIndex];
                user.balance += card.valueToSell;
                user.inventory = user.inventory.filter(c => c._id.toString() !== card._id.toString());
                await user.save();
                await i.update({ content: `Você vendeu a carta por ${card.valueToSell} moedas!`, embeds: [], components: [] });
                collector.stop('collected');
            } else if (i.customId === 'cancel_sell') {
                await i.update({ content: 'Venda cancelada.', embeds: [], components: [] });
                collector.stop('collected');
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.followUp({ content: 'O tempo para vender a carta expirou.', components: [] });
            }
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Vende rapidamente uma carta do seu inventário')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('O nome da carta que você quer vender rápido')
                    .setRequired(true)
            )
            .toJSON();
    }
};
