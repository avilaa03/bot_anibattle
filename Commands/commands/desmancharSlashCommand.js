const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ui = require('../utils/embeds.js');
const negociabilidade = require('../utils/negociabilidade.js');
const User = require('../utils/userSchema.js');
const { desmancharRun } = require('../actions/run/desmancharRun.js');
const desmancharCollect = require('../actions/collect/desmancharCollect.js');
const desmancharEnd = require('../actions/end/desmancharEnd.js');
const { descricaoBase, localizacoes } = require('../utils/i18n.js');
const { tDaInteracao } = require('../utils/idioma.js');

module.exports = class DesmancharSlashCommand extends BaseSlashCommand {
    constructor() {
        super('desmanchar');
    }

    async run(client, interaction) {
        const t = await tDaInteracao(interaction);

        const name = interaction.options.getString('name').toLowerCase();
        const user = await User.findOne({ id: interaction.user.id });

        if (!user || user.inventory.length === 0) {
            const embed = ui.neutral(t('inventory.vazio_titulo'), t('comum.inventario_vazio_texto'));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const encontradas = user.inventory.filter((c) => c.name.toLowerCase().includes(name));

        // Carta de evento não desmancha: ela não volta a ser distribuída, e
        // desmanchar é o único clique do jogo que apaga algo insubstituível.
        const matchingCards = encontradas.filter(negociabilidade.podeDesmanchar);

        if (encontradas.length > 0 && matchingCards.length === 0) {
            const embed = ui.error(
                t('desmanchar.nao_da'),
                negociabilidade.motivoDeRecusa(encontradas[0], 'desmanchar', t.locale)
            );
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (matchingCards.length === 0) {
            const embed = ui.error(t('comum.carta_nao_encontrada'), t('comum.nenhuma_com_nome', { busca: name }));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const { message, indexRef, rowNavigation } = await desmancharRun(client, interaction, user, matchingCards, t);

        const filter = (i) => ['prev', 'next', 'confirm_desmanchar', 'cancel_desmanchar'].includes(i.customId)
            && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async (i) => {
            const result = await desmancharCollect(i, indexRef, matchingCards, user, rowNavigation, t);
            if (result === 'collected') collector.stop('collected');
        });

        collector.on('end', (collected, reason) => {
            desmancharEnd(interaction, reason, t);
        });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(descricaoBase('comandos.desmanchar.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.desmanchar.descricao'))
            .addStringOption((option) => option
                .setName('name')
                .setDescription(descricaoBase('comandos.desmanchar.opcao_nome'))
                .setDescriptionLocalizations(localizacoes('comandos.desmanchar.opcao_nome'))
                .setRequired(true))
            .toJSON();
    }
};
