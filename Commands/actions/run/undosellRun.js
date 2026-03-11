const User = require('../../utils/userSchema.js');
const Market = require('../../utils/marketSchema.js');
const { EmbedBuilder } = require('discord.js');

async function undosellRun(client, interaction) {
    const cardName = interaction.options.getString('cardname');

    const listing = await Market.findOne({ cardName: cardName, sellerId: interaction.user.id, status: 'available' });

    if (!listing) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Anúncio não encontrado')
            .setDescription('Anúncio não encontrado ou esta carta já foi vendida.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await listing.remove();

    const user = await User.findOne({ id: interaction.user.id });
    const card = {
        cardId: listing.cardId,
        originalCardId: listing.cardId,
        name: listing.cardName,
        series: listing.series,
        seriesImage: listing.seriesImage,
        baseImage: listing.baseImage,
        characterImage: listing.characterImage,
        rarity: listing.rarity,
        overall: listing.ovr,
        ATA: listing.ata,
        LIF: listing.int,
        POW: listing.def,
        obtainedAt: listing.obtainedAt,
        marketValue: listing.marketValue,
        valueToSell: listing.valueToSell
    };
    user.inventory.push(card);
    await user.save();

    const embed = new EmbedBuilder()
        .setTitle('✅ Anúncio removido')
        .setDescription(`**${listing.cardName}** foi removida do mercado e devolvida ao seu inventário.`)
        .setColor('#4CAF50');
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = undosellRun;