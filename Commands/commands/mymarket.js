const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const Market = require('../utils/marketSchema.js');

module.exports = class MyMarketSlashCommand extends BaseSlashCommand {
    constructor() {
        super('mymarket');
    }

    async run(client, interaction) {
        const listings = await Market.find({ sellerId: interaction.user.id });

        if (listings.length === 0) {
            return interaction.reply({ content: 'Você não tem cartas anunciadas no mercado.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('Suas Cartas Anunciadas no Mercado')
            .setColor(0x0099FF);

        listings.forEach(listing => {
            embed.addFields({ name: listing.cardName, value: `Preço: ${listing.marketValue} | Status: ${listing.status}`, inline: false });
        });

        const clearHistoryButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('clear_history')
                .setLabel('Limpar Histórico')
                .setStyle(ButtonStyle.Danger)
        );

        const message = await interaction.reply({ embeds: [embed], components: [clearHistoryButton], fetchReply: true });

        const filter = (i) => i.customId === 'clear_history' && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (i) => {
            if (i.customId === 'clear_history') {
                await Market.deleteMany({ sellerId: interaction.user.id, status: 'sold' });
                return i.update({ content: 'Histórico de vendas limpo com sucesso.', embeds: [], components: [] });
            }
        });

        collector.on('end', () => {
            if (message.editable) {
                message.edit({ components: [] });
            }
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Mostra as suas cartas anunciadas no mercado');
    }
};
