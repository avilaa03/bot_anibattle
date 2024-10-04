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

    const updateEmbed = () => {
        const card = matchingCards[currentIndex];
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

    const message = await interaction.reply({ embeds: [updateEmbed()], components: [createRow()], fetchReply: true });

    currentCollector = favCardCollect(interaction, message, currentIndex, matchingCards, user, favCardEnd);
};
