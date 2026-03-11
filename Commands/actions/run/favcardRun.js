const User = require('../../utils/userSchema');
const CardBuilder = require('../../utils/cardBuilder.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
let currentCollector = null

module.exports = async (client, interaction, favCardCollect, favCardEnd) => {
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

    const updateEmbed = async (index) => {
        const card = matchingCards[index];
        const cardBuilder = new CardBuilder(card);
        const cardImageBuffer = await cardBuilder.build();
        const attachment = new AttachmentBuilder(cardImageBuffer, { name: 'cardImage.png' });

        const embed = new EmbedBuilder()
            .setTitle('AniBattle')
            .setImage('attachment://cardImage.png')
            .addFields(
                { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                { name: "Série", value: card.series },
                { name: "Raridade", value: card.rarity }
            );
        return { embed, attachment };
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
                    .setLabel('Favoritar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Danger)
            );
    };

    if (currentCollector) {
        currentCollector.stop();
    }

    const { embed, attachment } = await updateEmbed(0);
    const message = await interaction.reply({ embeds: [embed], components: [createRow()], files: [attachment], fetchReply: true });

    currentCollector = favCardCollect(interaction, message, { currentIndex }, matchingCards, user, favCardEnd, updateEmbed, createRow);
};
