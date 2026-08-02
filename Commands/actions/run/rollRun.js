const CardBuilder = require('../../utils/cardBuilder');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');

// Coletores ativos por usuário — antes isto era uma única variável de módulo
// compartilhada por TODOS os usuários, o que fazia o /roll de um jogador
// cancelar silenciosamente o botão de outro jogador que tivesse rolado
// pouco antes. Agora cada usuário só derruba o próprio coletor anterior.
const activeCollectors = new Map();

const DEFAULT_ROLL_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos
const ROLL_COOLDOWN_MS = Number(process.env.ROLL_COOLDOWN_MS) > 0
    ? Number(process.env.ROLL_COOLDOWN_MS)
    : DEFAULT_ROLL_COOLDOWN_MS;

function errorEmbed(description) {
    return ui.error('Erro', description);
}

/** Sorteia uma carta aleatória de uma raridade usando amostragem no banco,
 * em vez de carregar toda a raridade na memória a cada roll. */
async function sampleCardByRarity(rarity) {
    const results = await Card.aggregate([
        { $match: { rarity } },
        { $sample: { size: 1 } }
    ]);
    return results[0] || null;
}

module.exports = async (client, interaction, rollCollect, rollEnd) => {
    let user;
    try {
        user = await User.findOne({ id: interaction.user.id });
    } catch (err) {
        console.error('Erro ao buscar as informações do usuário:', err);
        return interaction.reply({ embeds: [errorEmbed('Houve um erro ao buscar suas informações. Tente novamente.')], ephemeral: true });
    }

    const now = Date.now();

    if (user && user.lastRoll && now - user.lastRoll < ROLL_COOLDOWN_MS) {
        const timeRemaining = ROLL_COOLDOWN_MS - (now - user.lastRoll);
        const readyAt = Math.floor((now + timeRemaining) / 1000);
        const embed = ui.warning('Ainda no cooldown', `Você poderá rolar de novo <t:${readyAt}:R>.`)
            .addFields(
                { name: 'Tempo restante', value: ui.duration(timeRemaining), inline: true },
                { name: 'Intervalo', value: ui.duration(ROLL_COOLDOWN_MS), inline: true }
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply();

    const rarities = [
        { rarity: 'common', percentage: 55 },
        { rarity: 'rare', percentage: 28 },
        { rarity: 'ultra rare', percentage: 12 },
        { rarity: 'legendary', percentage: 4 },
        { rarity: 'master', percentage: 1 }
    ];

    const random = Math.random() * 100;
    let accumulated = 0;
    let rarity;
    for (const r of rarities) {
        accumulated += r.percentage;
        if (random <= accumulated) {
            rarity = r.rarity;
            break;
        }
    }
    if (!rarity) rarity = 'common';

    let card = await sampleCardByRarity(rarity);
    if (!card) {
        card = await sampleCardByRarity('common');
    }
    if (!card) {
        return interaction.editReply({ embeds: [errorEmbed('Nenhuma carta encontrada no banco de dados.')] });
    }

    const marketValue = card.overall * 10;
    const valueToSell = marketValue / 2;

    const cardBuilder = new CardBuilder(card);
    const cardImageBuffer = await cardBuilder.build();

    const rarityMeta = ui.getRarity(card.rarity);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`enviarInventario_${card._id}_${interaction.user.id}`)
                .setLabel('Guardar no inventário')
                .setEmoji('🎴')
                .setStyle(ButtonStyle.Success)
        )
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`vender_${card._id}_${interaction.user.id}`)
                .setLabel(`Vender por ${ui.number(valueToSell)}`)
                .setEmoji('🪙')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = ui.base(rarityMeta.color)
        .setAuthor({ name: `${interaction.user.username} rolou uma carta`, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`${rarityMeta.emoji} ${ui.cardName(card.name)}`)
        .setDescription([
            `*${card.series}*`,
            '',
            ui.statLines(card),
            '',
            `Raridade ${ui.rarityTag(card.rarity)} • Overall **${card.overall}**`
        ].join('\n'))
        .addFields(
            { name: 'Valor de mercado', value: ui.coins(marketValue), inline: true },
            { name: 'Venda rápida', value: ui.coins(valueToSell), inline: true }
        )
        .setImage('attachment://cardImage.png');

    await interaction.editReply({ embeds: [embed], components: [row], files: [{ attachment: cardImageBuffer, name: 'cardImage.png' }] });

    if (!user) {
        user = new User({ id: interaction.user.id });
    }

    user.lastRoll = now;
    await user.save();

    const previousCollector = activeCollectors.get(interaction.user.id);
    if (previousCollector) {
        previousCollector.stop();
    }

    const collector = rollCollect(interaction, card, user, marketValue, valueToSell, rollEnd);
    activeCollectors.set(interaction.user.id, collector);
    collector.on('end', () => {
        if (activeCollectors.get(interaction.user.id) === collector) {
            activeCollectors.delete(interaction.user.id);
        }
    });
};
