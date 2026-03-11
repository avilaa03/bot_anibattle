const User = require('../../utils/userSchema');
const CardBuilder = require('../../utils/cardBuilder.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
let currentCollector = null

module.exports = async (client, interaction, favCardCollect, favCardEnd) => {
    const name = interaction.options.getString('name').toLowerCase();
    const user = await User.findOne({ id: interaction.user.id });

    if (!user || user.inventory.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📋 Inventário vazio')
            .setDescription('Seu inventário está vazio ou você ainda não foi encontrado no sistema.')
            .setColor('#9E9E9E');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const matchingCards = user.inventory.filter(c => c.name.toLowerCase().includes(name));

    if (matchingCards.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Carta não encontrada')
            .setDescription('Nenhuma carta no seu inventário corresponde a esse nome.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply();

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
    const message = await interaction.editReply({ embeds: [embed], components: [createRow()], files: [attachment] });

    currentCollector = favCardCollect(interaction, message, { currentIndex }, matchingCards, user, favCardEnd, updateEmbed, createRow);
};
