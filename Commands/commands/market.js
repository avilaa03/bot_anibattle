const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const Market = require('../utils/marketSchema.js');
const User = require('../utils/userSchema.js');

module.exports = class MarketSlashCommand extends BaseSlashCommand {
    constructor() {
        super('market');
    }

    async run(client, interaction) {
        const cardName = interaction.options.getString('cardname') || '';
        const minValue = interaction.options.getInteger('minvalue') || 0;
        const maxValue = interaction.options.getInteger('maxvalue') || Number.MAX_VALUE;
        const rarity = interaction.options.getString('rarity') || '';

        const query = {
            cardName: new RegExp(cardName, 'i'),
            listingPrice: { $gte: minValue, $lte: maxValue },
            status: 'available'
        };

        if (rarity) {
            query.rarity = rarity;
        }

        const listings = await Market.find(query);

        if (listings.length === 0) {
            return interaction.reply({ content: 'Nenhuma carta encontrada.', ephemeral: true });
        }

        let currentPage = 0;
        const cardsPerPage = 9;

        const generateEmbed = (page) => {
            const start = page * cardsPerPage;
            const end = start + cardsPerPage;
            const pageCards = listings.slice(start, end);

            const embed = new EmbedBuilder()
                .setTitle('Cartas Disponíveis no Mercado')
                .setDescription(`Página ${page + 1} de ${Math.ceil(listings.length / cardsPerPage)}`)
                .setColor(0x0099FF);

            pageCards.forEach((listing, index) => {
                embed.addFields({ name: `${index + 1}. ${listing.cardName}`, value: `Preço: ${listing.listingPrice}`, inline: false });
            });

            return embed;
        };

        const generateButtons = (page) => {
            const buttons = new ActionRowBuilder();

            if (page > 0) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous_page')
                        .setLabel('Anterior')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            if (page < Math.ceil(listings.length / cardsPerPage) - 1) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('Próximo')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            return buttons.components.length > 0 ? [buttons] : [];
        };

        const embedMessage = await interaction.reply({
            embeds: [generateEmbed(currentPage)],
            components: generateButtons(currentPage),
            fetchReply: true
        });

        const filter = (i) => ['previous_page', 'next_page'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = embedMessage.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (i) => {
            if (i.customId === 'previous_page') {
                currentPage--;
            } else if (i.customId === 'next_page') {
                currentPage++;
            }

            await i.update({
                embeds: [generateEmbed(currentPage)],
                components: generateButtons(currentPage)
            });
        });

        collector.on('end', () => {
            if (embedMessage.editable) {
                embedMessage.edit({ components: [] });
            }
        });

        const numberFilter = (response) => {
            const choice = parseInt(response.content);
            return !isNaN(choice) && choice > 0 && choice <= Math.min(cardsPerPage, listings.length - currentPage * cardsPerPage) && response.author.id === interaction.user.id;
        };

        const numberCollector = interaction.channel.createMessageCollector({ filter: numberFilter, time: 60000 });

        numberCollector.on('collect', async (response) => {
            const choice = parseInt(response.content);
            const selectedCard = listings[currentPage * cardsPerPage + choice - 1];

            const confirmEmbed = new EmbedBuilder()
                .setTitle('Confirmar Compra')
                .setDescription(`Você quer comprar a carta **${selectedCard.cardName}** por **${selectedCard.listingPrice}** moedas?`)
                .setColor(0x00FF00);

            const confirmButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_buy')
                        .setLabel('Confirmar')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('cancel_buy')
                        .setLabel('Cancelar')
                        .setStyle(ButtonStyle.Danger)
                );

            const confirmMessage = await response.reply({ embeds: [confirmEmbed], components: [confirmButtons], fetchReply: true });

            const confirmFilter = (i) => ['confirm_buy', 'cancel_buy'].includes(i.customId) && i.user.id === interaction.user.id;
            const confirmCollector = confirmMessage.createMessageComponentCollector({ filter: confirmFilter, time: 60000 });

            confirmCollector.on('collect', async (i) => {
                if (i.customId === 'confirm_buy') {
                    const buyer = await User.findOne({ id: interaction.user.id });
                    const seller = await User.findOne({ id: selectedCard.sellerId });

                    if (buyer.balance < selectedCard.listingPrice) {
                        return i.update({ content: 'Você não tem dinheiro suficiente para comprar esta carta.', embeds: [], components: [], ephemeral: true });
                    }

                    buyer.balance -= selectedCard.listingPrice;
                    seller.balance += selectedCard.listingPrice;

                    const cardToAdd = {
                        cardId: selectedCard.cardId,
                        originalCardId: selectedCard.cardId,
                        name: selectedCard.cardName,
                        series: selectedCard.series,
                        image: selectedCard.image,
                        rarity: selectedCard.rarity,
                        ovr: selectedCard.ovr,
                        ata: selectedCard.ata,
                        int: selectedCard.int,
                        def: selectedCard.def,
                        des: selectedCard.des,
                        pow: selectedCard.pow,
                        res: selectedCard.res,
                        obtainedAt: selectedCard.obtainedAt,
                        marketValue: selectedCard.marketValue,
                        valueToSell: selectedCard.marketValue / 2
                    };

                    buyer.inventory.push(cardToAdd);

                    await buyer.save();
                    await seller.save();

                    selectedCard.status = 'sold';
                    await selectedCard.save();

                    return i.update({ content: 'Compra realizada com sucesso!', embeds: [], components: [] });
                } else if (i.customId === 'cancel_buy') {
                    return i.update({ content: 'Compra cancelada.', embeds: [], components: [] });
                }
            });

            confirmCollector.on('end', () => {
                if (confirmMessage.editable) {
                    confirmMessage.edit({ components: [] });
                }
            });
        });

        numberCollector.on('end', () => {
            if (embedMessage.editable) {
                embedMessage.edit({ components: [] });
            }
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Procura por cartas no mercado e permite a compra')
            .addStringOption(option => option.setName('cardname').setDescription('Nome da carta').setRequired(false))
            .addIntegerOption(option => option.setName('minvalue').setDescription('Valor mínimo').setRequired(false))
            .addIntegerOption(option => option.setName('maxvalue').setDescription('Valor máximo').setRequired(false))
            .addStringOption(option => option.setName('rarity').setDescription('Raridade da carta').setRequired(false));
    }
};
