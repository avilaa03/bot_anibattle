const { EmbedBuilder } = require('discord.js');
const User = require('../../utils/userSchema')

async function profileRun(client, interaction) {
    const user = await User.findOne({ id: interaction.user.id });

    if (!user) {
        return interaction.reply({ content: 'Perfil não encontrado.', ephemeral: true });
    }

    const favCard = user.inventory.find(card => card.cardId.equals(user.favCard));
    const totalCards = user.inventory.length;
    const totalValue = user.inventory.reduce((sum, card) => sum + card.marketValue, 0);
    const highestOvrCard = user.inventory.reduce((max, card) => card.ovr > max.ovr ? card : max, user.inventory[0]);

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle('Perfil do Usuário')
        .addFields(
            { name: 'Tamanho do Inventário', value: `${totalCards} cartas`, inline: true },
            { name: 'Valor Total das Cartas', value: `${totalValue}`, inline: true },
            { name: 'Carta Favorita', value: favCard ? favCard.name : 'Nenhuma', inline: false },
            { name: 'Carta com Maior OVR', value: `${highestOvrCard.name} (OVR: ${highestOvrCard.ovr})`, inline: false }
        );

    if (favCard) {
        embed.setThumbnail(favCard.image);
    }

    return interaction.reply({ embeds: [embed] });
}

module.exports = profileRun