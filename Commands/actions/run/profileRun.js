const { EmbedBuilder } = require('discord.js');
const User = require('../../utils/userSchema')

async function profileRun(client, interaction) {
    const user = await User.findOne({ id: interaction.user.id });

    if (!user) {
        return interaction.reply({ content: 'Perfil não encontrado.', ephemeral: true });
    }

    const favCard = user.favCard
        ? user.inventory.find(card => card.cardId && card.cardId.equals(user.favCard))
        : null;
    const totalCards = user.inventory.length;
    const totalValue = user.inventory.reduce((sum, card) => sum + (card.marketValue || 0), 0);

    let highestOvrCard = null;
    if (user.inventory.length > 0) {
        highestOvrCard = user.inventory.reduce((max, card) => {
            const ovr = card.overall ?? 0;
            const maxOvr = max.overall ?? 0;
            return ovr > maxOvr ? card : max;
        }, user.inventory[0]);
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle('Perfil do Usuário')
        .addFields(
            { name: 'Tamanho do Inventário', value: `${totalCards} cartas`, inline: true },
            { name: 'Valor Total das Cartas', value: `${totalValue} moedas`, inline: true },
            { name: 'Carta Favorita', value: favCard ? favCard.name : 'Nenhuma', inline: false },
            { name: 'Carta com Maior OVR', value: highestOvrCard ? `${highestOvrCard.name} (OVR: ${highestOvrCard.overall ?? 0})` : 'Nenhuma carta no inventário', inline: false }
        );

    if (favCard && (favCard.characterImage || favCard.baseImage)) {
        embed.setThumbnail(favCard.characterImage || favCard.baseImage);
    }

    return interaction.reply({ embeds: [embed] });
}

module.exports = profileRun