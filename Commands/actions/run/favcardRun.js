const User = require('../../utils/userSchema');
const { renderCard } = require('../../utils/cardRenderer.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds');
const { molduraEfetiva } = require('../../utils/vip');
const { tDaInteracao } = require('../../utils/language');

// Coletores ativos por usuário (ver rollRun.js para o motivo de não usar
// mais uma única variável de módulo compartilhada entre todos os usuários).
const activeCollectors = new Map();

module.exports = async (client, interaction, favCardCollect, favCardEnd) => {
    const t = await tDaInteracao(interaction);

    const name = interaction.options.getString('name').toLowerCase();
    const user = await User.findOne({ id: interaction.user.id });

    if (!user || user.inventory.length === 0) {
        const embed = ui.neutral(t('inventory.vazio_titulo'), t('comum.inventario_vazio_texto'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const matchingCards = user.inventory.filter(c => c.name.toLowerCase().includes(name));

    if (matchingCards.length === 0) {
        const embed = ui.error(t('comum.carta_nao_encontrada'), t('comum.nenhuma_com_nome', { busca: name }));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    let currentIndex = 0;

    const updateEmbed = async (index) => {
        const card = matchingCards[index];
        const render = await renderCard(card, { moldura: molduraEfetiva(user) });
        const attachment = render.attachment;

        const meta = ui.getRarity(card.rarity, t.locale);
        const embed = ui.base(meta.color)
            .setTitle(`${meta.emoji} ${ui.cardName(card)}`)
            .setDescription([
                `*${card.series || t('comum.traco')}*`,
                '',
                ui.statLines(card, t.locale),
                '',
                t('roll.linha_raridade', {
                    raridade: ui.rarityTag(card.rarity, t.locale),
                    overall: card.overall ?? 0
                }),
                '',
                t('favcard.instrucao')
            ].join('\n'))
            .setImage(render.url)
            .setFooter({
                text: `${ui.BRAND} • ${t('show.contador', { atual: index + 1, total: matchingCards.length })}`
            });
        return { embed, attachment };
    };

    const createRow = () => {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel(t('comum.anterior'))
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(matchingCards.length === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel(t('comum.proxima'))
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(matchingCards.length === 1),
                new ButtonBuilder()
                    .setCustomId('fav')
                    .setLabel(t('favcard.botao_favoritar'))
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel(t('comum.cancelar'))
                    .setStyle(ButtonStyle.Danger)
            );
    };

    const previousCollector = activeCollectors.get(interaction.user.id);
    if (previousCollector) {
        previousCollector.stop();
    }

    const { embed, attachment } = await updateEmbed(0);
    const message = await interaction.editReply({ embeds: [embed], components: [createRow()], files: [attachment] });

    const collector = favCardCollect(interaction, message, { currentIndex }, matchingCards, user, favCardEnd, updateEmbed, createRow, t);
    activeCollectors.set(interaction.user.id, collector);
    collector.on('end', () => {
        if (activeCollectors.get(interaction.user.id) === collector) {
            activeCollectors.delete(interaction.user.id);
        }
    });
};
