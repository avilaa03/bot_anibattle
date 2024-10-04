const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { showCollect } = require('../collect/showCollect.js');
const { showEnd } = require('../end/showEnd.js');

async function showRun(client, interaction) {
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

    const updateEmbed = (index, cards) => {
        const card = cards[index];
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

    const message = await interaction.reply({ embeds: [updateEmbed(currentIndex, matchingCards)], components: [row], fetchReply: true });

    const filter = i => i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    // Chama as funções de coleta e encerramento
    await showCollect(interaction, collector, matchingCards, currentIndex, updateEmbed, row);
    showEnd(message);
}

module.exports = showRun;
