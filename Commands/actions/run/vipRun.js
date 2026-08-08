const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const {
    TIERS, ORDEM_TIERS, isVipAtivo, getTier,
    nomeTier, localizarMoldura
} = require('../../utils/vip');
const { tDaInteracao } = require('../../utils/idioma');

const LOJA_URL = process.env.LOJA_URL || null;

function descreverVantagens(tier, t) {
    const linhas = [
        t('vip_ui.vantagem_cooldown', { porcento: Math.round((1 - tier.rollCooldownMultiplier) * 100) }),
        t('vip_ui.vantagem_daily', { multiplicador: tier.dailyMultiplier }),
        t('vip_ui.vantagem_molduras', {
            n: tier.molduras.length,
            lista: tier.molduras.map((m) => localizarMoldura(m, t.locale).nome).join(', ')
        }),
        t('vip_ui.vantagem_emblema', { emoji: tier.emoji, plano: nomeTier(tier.key, t.locale) })
    ];
    if (tier.podeCorPerfil) linhas.push(t('vip_ui.vantagem_cor'));
    if (tier.podeBanner) linhas.push(t('vip_ui.vantagem_banner'));
    if (tier.destaqueRanking) linhas.push(t('vip_ui.vantagem_destaque'));
    return linhas.join('\n');
}

async function vipRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const user = await User.findOne({ id: interaction.user.id }).lean();
    const ativo = isVipAtivo(user);
    const tierAtual = getTier(user);

    const embed = ui.base(tierAtual ? tierAtual.cor : ui.STATUS_COLORS.info)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(t('vip_ui.titulo'));

    if (ativo) {
        const expira = user.vip.expiresAt
            ? `<t:${Math.floor(new Date(user.vip.expiresAt).getTime() / 1000)}:R>`
            : t('vip_ui.vitalicio');
        embed.setDescription(t('vip_ui.ativo', {
            emoji: tierAtual.emoji,
            plano: nomeTier(tierAtual.key, t.locale),
            quando: expira
        }));
    } else {
        embed.setDescription(t('vip_ui.inativo'));
    }

    for (const key of ORDEM_TIERS) {
        const tier = TIERS[key];
        const marcador = tierAtual && tierAtual.key === key ? t('vip_ui.seu_plano') : '';
        embed.addFields({
            name: t('vip_ui.cabecalho_plano', {
                emoji: tier.emoji,
                plano: nomeTier(key, t.locale),
                // O preço é em reais nos dois idiomas: a cobrança é
                // brasileira. Mostrar "$" para quem lê em inglês seria
                // dizer que a compra é em dólar, o que não é verdade.
                preco: tier.precoBRL.toFixed(2).replace('.', ','),
                marcador
            }),
            value: descreverVantagens(tier, t),
            inline: false
        });
    }

    embed.setFooter({ text: `${ui.BRAND} • ${t('vip_ui.rodape')}` });

    const componentes = [];
    if (LOJA_URL) {
        componentes.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(t('vip_ui.botao_assinar'))
                .setEmoji('✨')
                .setStyle(ButtonStyle.Link)
                .setURL(LOJA_URL)
        ));
    }

    return interaction.reply({ embeds: [embed], components: componentes });
}

module.exports = vipRun;
