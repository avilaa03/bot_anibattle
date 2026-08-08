const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const { tDaInteracao } = require('../utils/idioma');
const ui = require('../utils/embeds.js');
const User = require('../utils/userSchema.js');
const { quicksellRun } = require('../actions/run/quicksellRun.js');
const quicksellCollect = require('../actions/collect/quicksellCollect.js');
const quicksellEnd = require('../actions/end/quicksellEnd.js');

module.exports = class QuickSellSlashCommand extends BaseSlashCommand {
    constructor() {
        super('quicksell');
    }

    async run(client, interaction) {
        const t = await tDaInteracao(interaction);
        const name = interaction.options.getString('name').toLowerCase();
        const user = await User.findOne({ id: interaction.user.id });

        if (!user || user.inventory.length === 0) {
            const embed = ui.neutral(`📋 ${t('comum.inventario_vazio')}`, t('comum.inventario_vazio_texto'));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const matchingCards = user.inventory.filter(c => c.name.toLowerCase().includes(name));

        if (matchingCards.length === 0) {
            const embed = ui.error(t('comum.carta_nao_encontrada'), t('quicksell.nenhuma_com_nome', { nome: name }));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const { message, indexRef, rowNavigation } = await quicksellRun(client, interaction, user, matchingCards, t);

        const filter = i => ['prev', 'next', 'confirm_sell', 'cancel_sell'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
            const result = await quicksellCollect(i, indexRef, matchingCards, user, rowNavigation, t);
            if (result === 'collected') collector.stop('collected');
        });

        collector.on('end', (collected, reason) => {
            quicksellEnd(interaction, reason, t);
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.quicksell.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.quicksell.descricao'))
            .addStringOption(option => 
                option.setName('name')
                .setDescription(descricaoBase('comandos.quicksell.opcao_name'))
                    .setDescriptionLocalizations(localizacoes('comandos.quicksell.opcao_name'))
                .setRequired(true)
            )
            .toJSON();
    }
};
