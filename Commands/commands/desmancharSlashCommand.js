const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ui = require('../utils/embeds.js');
const User = require('../utils/userSchema.js');
const { desmancharRun } = require('../actions/run/desmancharRun.js');
const desmancharCollect = require('../actions/collect/desmancharCollect.js');
const desmancharEnd = require('../actions/end/desmancharEnd.js');

module.exports = class DesmancharSlashCommand extends BaseSlashCommand {
    constructor() {
        super('desmanchar');
    }

    async run(client, interaction) {
        const name = interaction.options.getString('name').toLowerCase();
        const user = await User.findOne({ id: interaction.user.id });

        if (!user || user.inventory.length === 0) {
            const embed = ui.neutral('📋 Inventário vazio', 'Você ainda não tem cartas. Use `/roll` para ganhar a primeira!');
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const matchingCards = user.inventory.filter((c) => c.name.toLowerCase().includes(name));

        if (matchingCards.length === 0) {
            const embed = ui.error('Carta não encontrada', `Nenhuma carta no seu inventário tem "${name}" no nome.`);
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const { message, indexRef, rowNavigation } = await desmancharRun(client, interaction, user, matchingCards);

        const filter = (i) => ['prev', 'next', 'confirm_desmanchar', 'cancel_desmanchar'].includes(i.customId)
            && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async (i) => {
            const result = await desmancharCollect(i, indexRef, matchingCards, user, rowNavigation);
            if (result === 'collected') collector.stop('collected');
        });

        collector.on('end', (collected, reason) => {
            desmancharEnd(interaction, reason);
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Transforma uma carta do inventário em gemas de aprimoramento')
            .addStringOption((option) => option
                .setName('name')
                .setDescription('O nome da carta que você quer desmanchar')
                .setRequired(true))
            .toJSON();
    }
};
