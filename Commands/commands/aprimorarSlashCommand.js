const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ui = require('../utils/embeds.js');
const User = require('../utils/userSchema.js');
const { aprimorarRun } = require('../actions/run/aprimorarRun.js');
const aprimorarCollect = require('../actions/collect/aprimorarCollect.js');
const aprimorarEnd = require('../actions/end/aprimorarEnd.js');
const { descricaoBase, localizacoes } = require('../utils/i18n.js');
const { tDaInteracao } = require('../utils/idioma.js');

module.exports = class AprimorarSlashCommand extends BaseSlashCommand {
    constructor() {
        super('aprimorar');
    }

    async run(client, interaction) {
        const t = await tDaInteracao(interaction);

        const name = interaction.options.getString('name').toLowerCase();
        // Sem `.lean()`: a bolsa precisa vir como Map para o cálculo de
        // quantos itens o jogador tem.
        const user = await User.findOne({ id: interaction.user.id });

        if (!user || user.inventory.length === 0) {
            const embed = ui.neutral(t('inventory.vazio_titulo'), t('comum.inventario_vazio_texto'));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const matchingCards = user.inventory.filter((c) => c.name.toLowerCase().includes(name));

        if (matchingCards.length === 0) {
            const embed = ui.error(t('comum.carta_nao_encontrada'), t('comum.nenhuma_com_nome', { busca: name }));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const { message, indexRef, rowNavigation } = await aprimorarRun(client, interaction, user, matchingCards, t);

        const ids = ['prev', 'next', 'confirm_aprimorar', 'confirm_aprimorar_protegido', 'cancel_aprimorar'];
        const filter = (i) => ids.includes(i.customId) && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (i) => {
            const result = await aprimorarCollect(i, indexRef, matchingCards, user, rowNavigation, t);
            if (result === 'collected') collector.stop('collected');
        });

        collector.on('end', (collected, reason) => {
            aprimorarEnd(interaction, reason, t);
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.aprimorar.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.aprimorar.descricao'))
            .addStringOption((option) => option
                .setName('name')
                .setDescription(descricaoBase('comandos.aprimorar.opcao_nome'))
                .setDescriptionLocalizations(localizacoes('comandos.aprimorar.opcao_nome'))
                .setRequired(true))
            .toJSON();
    }
};
