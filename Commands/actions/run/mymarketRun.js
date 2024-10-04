const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Market = require('../../utils/marketSchema.js')

async function mymarketRun(client, interaction) {
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
}

module.exports = mymarketRun