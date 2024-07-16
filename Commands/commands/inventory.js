const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const User = require('../utils/userSchema.js');

module.exports = class InventorySlashCommand extends BaseSlashCommand {
    constructor() {
        super('inventory');
    }

    async run(client, interaction) {
        const user = await User.findOne({ id: interaction.user.id });

        if (!user || user.inventory.length === 0) {
            return interaction.reply({ content: 'Seu inventário está vazio.', ephemeral: true });
        }

        const favCard = user.inventory.find(card => card.cardId.equals(user.favCard));
        const cardsPerPage = 6;
        let currentPage = 0;

        const generateEmbed = (page) => {
            const start = page * cardsPerPage;
            const end = start + cardsPerPage;
            const currentCards = user.inventory.slice(start, end);

            const embed = new EmbedBuilder()
                .setTitle('Seu Inventário de Cartas')
                .setDescription('Aqui estão as cartas do seu inventário.')
                .setFooter({ text: `Página ${page + 1} de ${Math.ceil(user.inventory.length / cardsPerPage)}` });

            if (favCard) {
                embed.setThumbnail(favCard.image);
            }

            currentCards.forEach(card => {
                embed.addFields({ name: card.name, value: `OVR: ${card.ovr}`, inline: false });
            });

            return embed;
        };

        const generateButtons = (page) => {
            const buttons = new ActionRowBuilder();

            if (page > 0) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous_page')
                        .setLabel('Página Anterior')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            if ((page + 1) * cardsPerPage < user.inventory.length) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('Próxima Página')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            // Se não houver botões, adicione um botão desabilitado para evitar o erro de array vazio
            if (buttons.components.length === 0) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('no_action')
                        .setLabel('Sem Ações')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
            }

            return buttons;
        };

        const embedMessage = await interaction.reply({
            embeds: [generateEmbed(currentPage)],
            components: [generateButtons(currentPage)],
            fetchReply: true
        });

        const filter = (i) => ['previous_page', 'next_page'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = embedMessage.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (i) => {
            if (i.customId === 'previous_page') {
                currentPage--;
            } else if (i.customId === 'next_page') {
                currentPage++;
            }

            await i.update({
                embeds: [generateEmbed(currentPage)],
                components: [generateButtons(currentPage)]
            });
        });

        collector.on('end', () => {
            if (embedMessage.editable) {
                embedMessage.edit({ components: [] });
            }
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra as cartas no seu inventário');
    }
};
