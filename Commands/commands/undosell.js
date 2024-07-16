const { SlashCommandBuilder } = require('discord.js');
const BaseSlashCommand = require('../utils/BaseSlashCommand');
const User = require('../utils/userSchema.js');
const Market = require('../utils/marketSchema.js');

module.exports = class UndoSellSlashCommand extends BaseSlashCommand {
    constructor() {
        super('undosell');
    }

    async run(client, interaction) {
        const cardName = interaction.options.getString('cardname');

        const listing = await Market.findOne({ cardName: cardName, sellerId: interaction.user.id, status: 'available' });

        if (!listing) {
            return interaction.reply({ content: 'Anúncio não encontrado ou já foi vendido.', ephemeral: true });
        }

        await listing.remove();

        const user = await User.findOne({ id: interaction.user.id });
        const card = {
            cardId: listing.cardId,
            originalCardId: listing.cardId,
            name: listing.cardName,
            series: listing.series,
            image: listing.image,
            rarity: listing.rarity,
            ovr: listing.ovr,
            ata: listing.ata,
            int: listing.int,
            def: listing.def,
            des: listing.des,
            pow: listing.pow,
            res: listing.res,
            obtainedAt: listing.obtainedAt,
            marketValue: listing.marketValue,
            valueToSell: listing.valueToSell 
        };
        user.inventory.push(card);
        await user.save();

        return interaction.reply({ content: 'Anúncio removido com sucesso.', ephemeral: true });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Desfaz o anúncio de uma carta no mercado')
            .addStringOption(option => option.setName('cardname').setDescription('Nome da carta').setRequired(true));
    }
};
