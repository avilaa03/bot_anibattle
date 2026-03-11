const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../../utils/userSchema');
const { sellCollect } = require('../collect/sellCollect.js');
const { sellEnd } = require('../end/sellEnd.js');

async function sellRun(client, interaction) {
    const cardName = interaction.options.getString('cardname');
    const listingPrice = interaction.options.getInteger('price');

    const user = await User.findOne({ id: interaction.user.id });
    if (!user) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Erro')
            .setDescription('Usuário não encontrado.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const matchingCards = user.inventory.filter(card => card.name.toLowerCase().includes(cardName.toLowerCase()));

    if (matchingCards.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Carta não encontrada')
            .setDescription('Nenhuma carta no seu inventário corresponde a esse nome.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let currentIndex = 0;

    const updateEmbed = (cards, index, price) => {
        const card = cards[index];
        const embed = new EmbedBuilder()
            .setTitle('AniBattle')
            .setImage(card.image)
            .addFields(
                { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                { name: "Raridade", value: card.rarity },
                { name: "Valor de Venda", value: `${price} moedas` }
            );

        return embed;
    };

    const rowNavigation = new ActionRowBuilder()
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

    const rowConfirmation = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_sell')
                .setLabel(`Vender por ${listingPrice} moedas`)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('cancel_sell')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

    const message = await interaction.reply({
        embeds: [updateEmbed(matchingCards, currentIndex, listingPrice)],
        components: [rowNavigation, rowConfirmation],
        fetchReply: true
    });

    const filter = i => ['prev', 'next', 'confirm_sell', 'cancel_sell'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 30000 });

    await sellCollect(interaction, collector, matchingCards, currentIndex, listingPrice, user, rowNavigation, rowConfirmation);
    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            await sellEnd(interaction);
        }
    });
}

module.exports = sellRun;
