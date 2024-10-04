const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const User = require('../utils/userSchema.js');
const quicksellRun = require('../actions/run/quicksellRun.js');
const quicksellCollect = require('../actions/collect/quicksellCollect.js');
const quicksellEnd = require('../actions/end/quicksellEnd.js');

module.exports = class QuickSellSlashCommand extends BaseSlashCommand {
    constructor() {
        super('quicksell');
    }

    async run(client, interaction) {
        const name = interaction.options.getString('name').toLowerCase();
        const user = await User.findOne({ id: interaction.user.id });

        if (!user || user.inventory.length === 0) {
            return interaction.reply('Seu inventário está vazio ou o usuário não foi encontrado.');
        }

        const matchingCards = user.inventory.filter(c => c.name.toLowerCase().includes(name));

        if (matchingCards.length === 0) {
            return interaction.reply('Nenhuma carta encontrada com esse nome.');
        }

        const { message, currentIndex, rowNavigation, rowConfirmation } = await quicksellRun(client, interaction, user, matchingCards);

        const filter = i => ['prev', 'next', 'confirm_sell', 'cancel_sell'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 30000 });


        collector.on('collect', async i => {
            const result = await quicksellCollect(i, currentIndex, matchingCards, user, rowNavigation, rowConfirmation);
            if (result === 'collected') collector.stop('collected');
        });

        
        collector.on('end', (collected, reason) => {
            quicksellEnd(interaction, reason);
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Vende rapidamente uma carta do seu inventário')
            .addStringOption(option => 
                option.setName('name')
                .setDescription('O nome da carta que você quer vender rápido')
                .setRequired(true)
            )
            .toJSON();
    }
};
