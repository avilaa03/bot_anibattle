const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../utils/userSchema.js');

module.exports = class FavCardSlashCommand extends BaseSlashCommand {
    constructor() {
        super('favcard');
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
                .setTitle('AniBattle')
                .setImage(card.image)
                .addFields(
                    { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                    { name: "Série", value: card.series },
                    { name: "Raridade", value: card.rarity }
                );

            return embed;
        };

        const createRow = () => {
            return new ActionRowBuilder()
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
                        .setDisabled(matchingCards.length === 1),
                    new ButtonBuilder()
                        .setCustomId('fav')
                        .setLabel(`Favoritar`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('cancel')
                        .setLabel('Cancelar')
                        .setStyle(ButtonStyle.Danger)
                );
        };

        const message = await interaction.reply({ embeds: [updateEmbed()], components: [createRow()], fetchReply: true });

        const filter = i => ['prev', 'next', 'fav', 'cancel'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'prev') {
                currentIndex = (currentIndex - 1 + matchingCards.length) % matchingCards.length;
                await i.update({ embeds: [updateEmbed()], components: [createRow()] });
            } else if (i.customId === 'next') {
                currentIndex = (currentIndex + 1) % matchingCards.length;
                await i.update({ embeds: [updateEmbed()], components: [createRow()] });
            } else if (i.customId === 'fav') {
                user.favCard = matchingCards[currentIndex].cardId;
                await user.save();
                await i.update({ content: `A carta **${matchingCards[currentIndex].name}** foi adicionada como favorita!`, embeds: [], components: [] });
                collector.stop('collected');
            } else if (i.customId === 'cancel') {
                await i.update({ content: 'Operação cancelada.', embeds: [], components: [] });
                collector.stop('collected');
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason !== 'collected') {
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev')
                            .setLabel('Anterior')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Próximo')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('fav')
                            .setLabel('Favoritar')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('cancel')
                            .setLabel('Cancelar')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                    );
                message.edit({ components: [disabledRow] });
            }
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Favorita uma carta')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('O nome da carta que você quer favoritar')
                    .setRequired(true)
            );
    }
};
