let currentCollector = null;

module.exports = async (client, interaction, inventoryCollect, inventoryEnd) => {
    const user = await User.findOne({ id: interaction.user.id });

    if (!user || user.inventory.length === 0) {
        return interaction.reply({ content: 'Seu inventário está vazio.', ephemeral: true });
    }

    const favCard = user.inventory.find(card => card.cardId.equals(user.favCard));
    const cardsPerPage = 6;
    let currentPage = 0;

    const generateEmbed = (page) => {
        const start = page * cardsPerPage;
        const end = start + cardsPerPage;
        const currentCards = user.inventory.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle('Seu Inventário de Cartas')
            .setDescription('Aqui estão as cartas do seu inventário.')
            .setFooter({ text: `Página ${page + 1} de ${Math.ceil(user.inventory.length / cardsPerPage)}` });

        if (favCard) {
            embed.setThumbnail(favCard.image);
        }

        currentCards.forEach(card => {
            embed.addFields({ name: card.name, value: `OVR: ${card.ovr}`, inline: false });
        });

        return embed;
    };

    const generateButtons = (page) => {
        const buttons = new ActionRowBuilder();

        if (page > 0) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId('previous_page')
                    .setLabel('Página Anterior')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        if ((page + 1) * cardsPerPage < user.inventory.length) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Próxima Página')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        if (buttons.components.length === 0) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId('no_action')
                    .setLabel('Sem Ações')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
        }

        return buttons;
    };

    if (currentCollector) {
        currentCollector.stop();
    }

    const embedMessage = await interaction.reply({
        embeds: [generateEmbed(currentPage)],
        components: [generateButtons(currentPage)],
        fetchReply: true
    });

    currentCollector = inventoryCollect(interaction, embedMessage, currentPage, user, generateEmbed, generateButtons, inventoryEnd);
};
