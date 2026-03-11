const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { showCollect } = require('../collect/showCollect.js');
const User = require('../../utils/userSchema.js');
const { showEnd } = require('../end/showEnd.js');
const CardBuilder = require('../../utils/cardBuilder.js');

async function showRun(client, interaction) {
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
    const indexRef = { currentIndex };

    const updateEmbed = async (index, cards, includeImage = false) => {
        const card = cards[index];
        const cardBuilder = new CardBuilder(card);

        const embed = new EmbedBuilder()
            .setTitle('AniBattle')
            .addFields(
                { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                { name: "Série", value: card.series },
                { name: "Raridade", value: card.rarity }
            );

        if (includeImage) {
            const cardImageBuffer = await cardBuilder.build();
            const attachment = new AttachmentBuilder(cardImageBuffer, { name: 'cardImage.png' });
            embed.setImage('attachment://cardImage.png');
            return { embed, attachment };
        }

        embed.setImage('attachment://cardImage.png');
        return { embed };
    };

    const row = new ActionRowBuilder()
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

    const { embed, attachment } = await updateEmbed(indexRef.currentIndex, matchingCards, true);
    const message = await interaction.editReply({ embeds: [embed], components: [row], files: [attachment] });
    
    const filter = i => i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    await showCollect(interaction, collector, matchingCards, indexRef, updateEmbed, row);
    showEnd(message);
}

module.exports = showRun;
