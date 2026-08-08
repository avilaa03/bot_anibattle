const { renderCard } = require('../../utils/cardRenderer');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds');
const { getPerks, molduraEfetiva, nomeTier: vipNomeTier } = require('../../utils/vip');
const wishlist = require('../../utils/wishlist');
const { registrar } = require('../../utils/progresso');
const { notificarProgresso } = require('../../utils/notificacoes');
const { tDaInteracao } = require('../../utils/idioma');

/**
 * Menciona no canal quem tem a carta na lista de desejos.
 * Falhar aqui nunca pode atrapalhar o /roll — por isso a chamada é
 * disparada sem await e com catch.
 *
 * O aviso sai no idioma de quem rolou, não no de cada mencionado: é uma
 * mensagem só para várias pessoas, então não dá para ter as duas versões.
 */
async function avisarDesejantes(interaction, card, rarityMeta, t) {
    const desejantes = await wishlist.quemDeseja(card._id, interaction.user.id);
    if (desejantes.length === 0) return;

    const mencoes = desejantes.map((id) => `<@${id}>`).join(' ');
    const embed = ui.base(rarityMeta.color)
        .setTitle(t('roll.desejo_titulo'))
        .setDescription(t('roll.desejo_texto', {
            emoji: rarityMeta.emoji,
            carta: ui.cardName(card.name, t.locale),
            serie: card.series,
            jogador: interaction.user.username
        }));

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

function errorEmbed(t, chave) {
    return ui.error(t('comum.erro'), t(chave));
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
    const t = await tDaInteracao(interaction);

    let user;
    try {
        user = await User.findOne({ id: interaction.user.id });
    } catch (err) {
        console.error('Erro ao buscar as informações do usuário:', err);
        return interaction.reply({ embeds: [errorEmbed(t, 'roll.erro_busca')], flags: MessageFlags.Ephemeral });
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
        const embed = ui.warning(t('roll.cooldown_titulo'), t('roll.cooldown_texto', { quando: readyAt }))
            .addFields(
                { name: t('roll.tempo_restante'), value: ui.duration(timeRemaining, t.locale), inline: true },
                { name: t('roll.seu_intervalo'), value: ui.duration(cooldownEfetivo, t.locale), inline: true }
            );
        if (perks.vip) {
            embed.setFooter({
                text: `${ui.BRAND} • ${perks.tier.emoji} ${t('roll.rodape_vip', {
                    plano: vipNomeTier(perks.tier.key, t.locale),
                    porcento: Math.round((1 - perks.rollCooldownMultiplier) * 100)
                })}`
            });
        } else {
            embed.setFooter({ text: `${ui.BRAND} • ${t('roll.rodape_sem_vip')}` });
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
        return interaction.editReply({ embeds: [errorEmbed(t, 'roll.sem_cartas')] });
    }

    const marketValue = card.overall * 10;
    const valueToSell = marketValue / 2;

    const render = await renderCard(card, { moldura: molduraEfetiva(user), locale: t.locale });

    const rarityMeta = ui.getRarity(card.rarity, t.locale);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`enviarInventario_${card._id}_${interaction.user.id}`)
                .setLabel(t('roll.botao_guardar'))
                .setEmoji('🎴')
                .setStyle(ButtonStyle.Success)
        )
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`vender_${card._id}_${interaction.user.id}`)
                .setLabel(t('roll.botao_vender', { valor: ui.number(valueToSell, t.locale) }))
                .setEmoji('🪙')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = ui.base(rarityMeta.color)
        .setAuthor({ name: t('roll.autor', { jogador: interaction.user.username }), iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`${rarityMeta.emoji} ${ui.cardName(card.name, t.locale)}`)
        .setDescription([
            `*${card.series}*`,
            '',
            ui.statLines(card, t.locale),
            '',
            t('roll.linha_raridade', {
                raridade: ui.rarityTag(card.rarity, t.locale),
                overall: card.overall
            })
        ].join('\n'))
        .addFields(
            { name: t('roll.valor_mercado'), value: ui.coins(marketValue, t.locale), inline: true },
            { name: t('roll.venda_rapida'), value: ui.coins(valueToSell, t.locale), inline: true }
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
    avisarDesejantes(interaction, card, rarityMeta, t).catch(() => {});

    // Contadores, missões e conquistas.
    registrar(interaction.user.id, { rolls: 1 }, { eventosMissao: ['roll'] })
        .then((resultado) => notificarProgresso(interaction, resultado))
        .catch((err) => console.error('Erro ao registrar progresso do roll:', err));

    const previousCollector = activeCollectors.get(interaction.user.id);
    if (previousCollector) {
        previousCollector.stop();
    }

    const collector = rollCollect(interaction, card, user, marketValue, valueToSell, rollEnd, t);
    activeCollectors.set(interaction.user.id, collector);
    collector.on('end', () => {
        if (activeCollectors.get(interaction.user.id) === collector) {
            activeCollectors.delete(interaction.user.id);
        }
    });
};
