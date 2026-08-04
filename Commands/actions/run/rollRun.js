const { renderCard } = require('../../utils/cardRenderer');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds');
const { getPerks, molduraEfetiva } = require('../../utils/vip');
const wishlist = require('../../utils/wishlist');
const { registrar } = require('../../utils/progresso');
const { notificarProgresso } = require('../../utils/notificacoes');
const valores = require('../../utils/valores');

/**
 * Menciona no canal quem tem a carta na lista de desejos.
 * Falhar aqui nunca pode atrapalhar o /roll — por isso a chamada é
 * disparada sem await e com catch.
 */
async function avisarDesejantes(interaction, card, rarityMeta) {
    const desejantes = await wishlist.quemDeseja(card._id, interaction.user.id);
    if (desejantes.length === 0) return;

    const mencoes = desejantes.map((id) => `<@${id}>`).join(' ');
    const embed = ui.base(rarityMeta.color)
        .setTitle('💭 Carta da sua lista de desejos apareceu!')
        .setDescription(
            `${rarityMeta.emoji} **${ui.cardName(card.name)}** — *${card.series}*\n\n`
            + `Rolada por **${interaction.user.username}**. Que tal propor uma troca com \`/trocar\`?`
        );

    await interaction.followUp({ content: mencoes, embeds: [embed] }).catch(() => {});
}

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
        return interaction.reply({ embeds: [errorEmbed('Houve um erro ao buscar suas informações. Tente novamente.')], flags: MessageFlags.Ephemeral });
    }

    const now = Date.now();

    // VIP encurta o cooldown. É a única vantagem paga que encosta na
    // economia, por isso é modesta (no máximo -40%) e nunca mexe na
    // chance de raridade — o sorteio é igual para todo mundo.
    const perks = getPerks(user);
    const cooldownEfetivo = Math.round(ROLL_COOLDOWN_MS * perks.rollCooldownMultiplier);

    if (user && user.lastRoll && now - user.lastRoll < cooldownEfetivo) {
        const timeRemaining = cooldownEfetivo - (now - user.lastRoll);
        const readyAt = Math.floor((now + timeRemaining) / 1000);
        const embed = ui.warning('Ainda no cooldown', `Você poderá rolar de novo <t:${readyAt}:R>.`)
            .addFields(
                { name: 'Tempo restante', value: ui.duration(timeRemaining), inline: true },
                { name: 'Seu intervalo', value: ui.duration(cooldownEfetivo), inline: true }
            );
        if (perks.vip) {
            embed.setFooter({ text: `${ui.BRAND} • ${perks.tier.emoji} ${perks.tier.nome}: cooldown reduzido em ${Math.round((1 - perks.rollCooldownMultiplier) * 100)}%` });
        } else {
            embed.setFooter({ text: `${ui.BRAND} • Assinantes rolam com até 40% menos espera — veja /vip` });
        }
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

    // A raridade define a ordem de grandeza do preço; o overall só move
    // dentro da faixa. Ver `utils/valores.js` para o porquê.
    const { marketValue, valueToSell } = valores.valoresDaCarta(card);

    const render = await renderCard(card, { moldura: molduraEfetiva(user) });

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
        .setImage(render.url);

    await interaction.editReply({ embeds: [embed], components: [row], files: [render.attachment] });

    if (!user) {
        user = new User({ id: interaction.user.id });
    }

    user.lastRoll = now;
    await user.save();

    // Avisa quem tem essa carta na lista de desejos. É só um aviso: quem
    // rolou continua com prioridade total sobre a carta. A ideia é gerar
    // conversa e movimentar o mercado, não criar disputa por clique.
    avisarDesejantes(interaction, card, rarityMeta).catch(() => {});

    // Contadores, missões e conquistas.
    registrar(interaction.user.id, { rolls: 1 }, { eventosMissao: ['roll'] })
        .then((resultado) => notificarProgresso(interaction, resultado))
        .catch((err) => console.error('Erro ao registrar progresso do roll:', err));

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
