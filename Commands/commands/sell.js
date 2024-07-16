const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const User = require('../utils/userSchema.js');
const Market = require('../utils/marketSchema.js');

module.exports = class SellSlashCommand extends BaseSlashCommand {
    constructor() {
        super('sell');
    }

    async run(client, interaction) {
        const cardName = interaction.options.getString('cardname');
        const listingPrice = interaction.options.getInteger('price');

        const user = await User.findOne({ id: interaction.user.id });
        const matchingCards = user.inventory.filter(card => card.name.toLowerCase().includes(cardName.toLowerCase()));

        if (matchingCards.length === 0) {
            return interaction.reply({ content: 'Carta não encontrada no seu inventário.', ephemeral: true });
        }

        let currentIndex = 0;

        const updateEmbed = () => {
            const card = matchingCards[currentIndex];
            const embed = new EmbedBuilder()
                .setTitle('Anime Fight')
                .setImage(card.image)
                .addFields(
                    { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                    { name: "Raridade", value: card.rarity },
                    { name: "Valor de Venda", value: `${listingPrice} moedas` }
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
            embeds: [updateEmbed()],
            components: [rowNavigation, rowConfirmation],
            fetchReply: true
        });

        const filter = i => ['prev', 'next', 'confirm_sell', 'cancel_sell'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
            if (i.customId === 'prev') {
                currentIndex = (currentIndex - 1 + matchingCards.length) % matchingCards.length;
                await i.update({ embeds: [updateEmbed()], components: [rowNavigation, rowConfirmation] });
            } else if (i.customId === 'next') {
                currentIndex = (currentIndex + 1) % matchingCards.length;
                await i.update({ embeds: [updateEmbed()], components: [rowNavigation, rowConfirmation] });
            } else if (i.customId === 'confirm_sell') {
                const card = matchingCards[currentIndex];
                user.inventory = user.inventory.filter(c => c._id.toString() !== card._id.toString());

                const listing = new Market({
                    cardId: card._id,
                    sellerId: interaction.user.id,
                    cardName: card.name,
                    series: card.series,
                    image: card.image,
                    rarity: card.rarity,
                    ovr: card.ovr,
                    ata: card.ata,
                    int: card.int,
                    def: card.def,
                    des: card.des,
                    pow: card.pow,
                    res: card.res,
                    obtainedAt: card.obtainedAt,
                    marketValue: card.marketValue,  // Mantém o valor original
                    listingPrice: listingPrice,  // Valor definido pelo usuário
                    status: 'available'
                });

                await listing.save();
                await user.save();

                await i.update({ content: `Carta listada no mercado por ${listingPrice} moedas.`, embeds: [], components: [] });
                collector.stop('collected');
            } else if (i.customId === 'cancel_sell') {
                await i.update({ content: 'Venda cancelada.', embeds: [], components: [] });
                collector.stop('collected');
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.followUp({ content: 'O tempo para vender a carta expirou.', components: [] });
            }
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Lista uma carta do seu inventário no mercado')
            .addStringOption(option => option.setName('cardname').setDescription('Nome da carta').setRequired(true))
            .addIntegerOption(option => option.setName('price').setDescription('Preço de venda').setRequired(true));
    }
};
