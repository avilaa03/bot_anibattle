const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { TIERS, ORDEM_TIERS, MOLDURAS, isVipAtivo, getTier, getPerks } = require('../../utils/vip');

const LOJA_URL = process.env.LOJA_URL || null;

function descreverVantagens(tier) {
    const linhas = [
        `⏱️ Cooldown do \`/roll\` **-${Math.round((1 - tier.rollCooldownMultiplier) * 100)}%**`,
        `🎁 Recompensa diária **${tier.dailyMultiplier}x**`,
        `🖼️ ${tier.molduras.length} moldura(s) de carta: ${tier.molduras.map((m) => MOLDURAS[m]?.nome || m).join(', ')}`,
        `${tier.emoji} Emblema **${tier.nome}** no perfil e nos rankings`
    ];
    if (tier.podeCorPerfil) linhas.push('🎨 Cor personalizada de perfil');
    if (tier.podeBanner) linhas.push('🏞️ Banner de perfil');
    if (tier.destaqueRanking) linhas.push('✨ Nome destacado nos rankings');
    return linhas.join('\n');
}

async function vipRun(client, interaction) {
    const user = await User.findOne({ id: interaction.user.id }).lean();
    const ativo = isVipAtivo(user);
    const tierAtual = getTier(user);

    const embed = ui.base(tierAtual ? tierAtual.cor : ui.STATUS_COLORS.info)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle('✨ Planos VIP do AniBattle');

    if (ativo) {
        const expira = user.vip.expiresAt
            ? `<t:${Math.floor(new Date(user.vip.expiresAt).getTime() / 1000)}:R>`
            : 'nunca (vitalício)';
        embed.setDescription(`Você é **${tierAtual.emoji} ${tierAtual.nome}**!\nSua assinatura expira ${expira}.\n\nUse \`/cosmeticos\` para equipar suas molduras.`);
    } else {
        embed.setDescription(
            'Apoie o bot e leve vantagens de aparência e conveniência.\n\n' +
            '🛡️ **Nenhum plano dá vantagem de combate.** Atributos das cartas, chance de raridade e resultado de batalha são exatamente iguais para todo mundo — quem paga leva estilo e comodidade, não poder.'
        );
    }

    for (const key of ORDEM_TIERS) {
        const tier = TIERS[key];
        const marcador = tierAtual && tierAtual.key === key ? ' ← seu plano' : '';
        embed.addFields({
            name: `${tier.emoji} ${tier.nome} — R$ ${tier.precoBRL.toFixed(2).replace('.', ',')}/mês${marcador}`,
            value: descreverVantagens(tier),
            inline: false
        });
    }

    embed.setFooter({ text: `${ui.BRAND} • Cancelável a qualquer momento • Renovar antes de expirar acumula os dias restantes` });

    const componentes = [];
    if (LOJA_URL) {
        componentes.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Assinar')
                .setEmoji('✨')
                .setStyle(ButtonStyle.Link)
                .setURL(LOJA_URL)
        ));
    }

    return interaction.reply({ embeds: [embed], components: componentes });
}

module.exports = vipRun;
