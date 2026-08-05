const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ui = require('../utils/embeds.js');
const User = require('../utils/userSchema.js');
const { aprimorarRun } = require('../actions/run/aprimorarRun.js');
const aprimorarCollect = require('../actions/collect/aprimorarCollect.js');
const aprimorarEnd = require('../actions/end/aprimorarEnd.js');

module.exports = class AprimorarSlashCommand extends BaseSlashCommand {
    constructor() {
        super('aprimorar');
    }

    async run(client, interaction) {
        const name = interaction.options.getString('name').toLowerCase();
        // Sem `.lean()`: a bolsa precisa vir como Map para o cálculo de
        // quantos itens o jogador tem.
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

        const { message, indexRef, rowNavigation } = await aprimorarRun(client, interaction, user, matchingCards);

        const ids = ['prev', 'next', 'confirm_aprimorar', 'confirm_aprimorar_protegido', 'cancel_aprimorar'];
        const filter = (i) => ids.includes(i.customId) && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (i) => {
            const result = await aprimorarCollect(i, indexRef, matchingCards, user, rowNavigation);
            if (result === 'collected') collector.stop('collected');
        });

        collector.on('end', (collected, reason) => {
            aprimorarEnd(interaction, reason);
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Gasta gemas para tentar subir o nível de uma carta')
            .addStringOption((option) => option
                .setName('name')
                .setDescription('O nome da carta que você quer aprimorar')
                .setRequired(true))
            .toJSON();
    }
};
