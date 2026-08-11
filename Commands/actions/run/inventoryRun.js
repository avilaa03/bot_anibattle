const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const valores = require('../../utils/valores');
const { tDaInteracao } = require('../../utils/idioma');

// Coletores ativos por usuário (ver rollRun.js para o motivo de não usar
// mais uma única variável de módulo compartilhada entre todos os usuários).
const activeCollectors = new Map();

const CARDS_PER_PAGE = 8;

const getOvr = valores.overallDaCarta;

module.exports = async (client, interaction, inventoryCollect, inventoryEnd) => {
    const t = await tDaInteracao(interaction);

    const user = await User.findOne({ id: interaction.user.id });

    if (!user || user.inventory.length === 0) {
        const embed = ui.neutral(t('inventory.vazio_titulo'), t('comum.inventario_vazio_texto'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Ordena por raridade (mais rara primeiro) e depois por overall, que é
    // como o jogador espera ver a coleção — as melhores cartas no topo.
    const cards = [...user.inventory].sort((a, b) => {
        const byRarity = ui.compareRarityDesc(a.rarity, b.rarity);
        return byRarity !== 0 ? byRarity : getOvr(b) - getOvr(a);
    });

    const favCard = user.favCard
        ? cards.find((c) => c.cardId && c.cardId.equals(user.favCard))
        : null;

    const totalValue = cards.reduce((sum, c) => sum + (c.marketValue || 0), 0);
    const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);

    // Contagem por raridade, para o resumo do topo.
    const byRarity = cards.reduce((acc, c) => {
        const key = String(c.rarity || 'common').toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const rarityResumo = Object.keys(ui.RARITIES)
        .filter((key) => byRarity[key])
        .map((key) => `${ui.RARITIES[key].emoji} ${byRarity[key]}`)
        .join('  ');

    const generateEmbed = (page) => {
        const start = page * CARDS_PER_PAGE;
        const pageCards = cards.slice(start, start + CARDS_PER_PAGE);

        const lista = pageCards.map((card, i) => {
            const meta = ui.getRarity(card.rarity, t.locale);
            const isFav = favCard && card.cardId && card.cardId.equals(user.favCard);
            return `\`${String(start + i + 1).padStart(2, '0')}\` ${meta.emoji} **${ui.cardName(card)}**${isFav ? ' ⭐' : ''}\n`
                + `└ ${card.series || t('comum.traco')} • ${t('atributos.ovr')} **${getOvr(card)}**`
                + ` • ${ui.coins(card.marketValue || 0, t.locale)}`;
        }).join('\n');

        const embed = ui.base(ui.STATUS_COLORS.info)
            .setAuthor({
                name: t('inventory.autor', { jogador: interaction.user.username }),
                iconURL: interaction.user.displayAvatarURL()
            })
            .setDescription(`${rarityResumo}\n\n${lista}`)
            .addFields(
                { name: t('inventory.total_cartas'), value: `**${ui.number(cards.length, t.locale)}**`, inline: true },
                { name: t('inventory.valor_colecao'), value: ui.coins(totalValue, t.locale), inline: true }
            )
            .setFooter({ text: `${ui.BRAND} • ${t('comum.pagina', { atual: page + 1, total: totalPages })}` });

        if (favCard && (favCard.characterImage || favCard.baseImage)) {
            embed.setThumbnail(favCard.characterImage || favCard.baseImage);
        }

        return embed;
    };

    const generateButtons = (page) => {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('previous_page')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 0),
            new ButtonBuilder()
                .setCustomId('page_indicator')
                .setLabel(`${page + 1} / ${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('next_page')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        );
    };

    const previousCollector = activeCollectors.get(interaction.user.id);
    if (previousCollector) {
        previousCollector.stop();
    }

    await interaction.reply({
        embeds: [generateEmbed(0)],
        components: [generateButtons(0)]
    });
    const embedMessage = await interaction.fetchReply();

    const collector = inventoryCollect(interaction, embedMessage, 0, user, generateEmbed, generateButtons, inventoryEnd);
    activeCollectors.set(interaction.user.id, collector);
    collector.on('end', () => {
        if (activeCollectors.get(interaction.user.id) === collector) {
            activeCollectors.delete(interaction.user.id);
        }
    });
};
