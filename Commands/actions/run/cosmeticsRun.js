const { ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { MOLDURAS, getPerks, isVipAtivo, nomeTier, localizarMoldura } = require('../../utils/vip');
const { tDaInteracao } = require('../../utils/language');

// O nome de cada cor sai do dicionário (`cosmeticos.cores.<chave>`).
const CORES = [
    { chave: 'vermelho', valor: 0xE53935, emoji: '🔴' },
    { chave: 'azul', valor: 0x2196F3, emoji: '🔵' },
    { chave: 'verde', valor: 0x4CAF50, emoji: '🟢' },
    { chave: 'roxo', valor: 0x9C27B0, emoji: '🟣' },
    { chave: 'dourado', valor: 0xFFD700, emoji: '🟡' },
    { chave: 'rosa', valor: 0xE91E63, emoji: '🩷' },
    { chave: 'preto', valor: 0x2C2C2C, emoji: '⚫' }
];

function montarEmbed(user, t) {
    const perks = getPerks(user);
    const molduraAtual = user?.cosmetics?.moldura || 'nenhuma';
    const corAtual = user?.cosmetics?.corPerfil;

    if (!perks.vip) {
        return ui.warning(t('cosmeticos.titulo_curto'), t('cosmeticos.so_vip'));
    }

    const corEscolhida = CORES.find((c) => c.valor === corAtual);
    const nomeCor = corEscolhida
        ? t(`cosmeticos.cores.${corEscolhida.chave}`)
        : t('cosmeticos.cor_padrao');

    return ui.base(perks.tier.cor)
        .setTitle(t('cosmeticos.titulo'))
        .setDescription(t('cosmeticos.descricao', {
            emoji: perks.tier.emoji,
            plano: nomeTier(perks.tier.key, t.locale)
        }))
        .addFields(
            { name: t('cosmeticos.moldura_equipada'), value: localizarMoldura(molduraAtual, t.locale).nome, inline: true },
            { name: t('cosmeticos.cor_perfil'), value: nomeCor, inline: true },
            {
                name: t('cosmeticos.liberadas'),
                value: perks.moldurasDisponiveis.map((m) => {
                    const info = localizarMoldura(m, t.locale);
                    return `• **${info.nome}** — ${info.descricao}`;
                }).join('\n'),
                inline: false
            }
        );
}

function montarComponentes(user, t) {
    const perks = getPerks(user);
    if (!perks.vip) return [];

    const molduraAtual = user?.cosmetics?.moldura || 'nenhuma';
    const corAtual = user?.cosmetics?.corPerfil;

    const menuMoldura = new StringSelectMenuBuilder()
        .setCustomId('cosm_moldura')
        .setPlaceholder(t('cosmeticos.placeholder_moldura'))
        .addOptions(perks.moldurasDisponiveis.map((m) => {
            const info = localizarMoldura(m, t.locale);
            return {
                label: info.nome,
                description: info.descricao.slice(0, 100),
                value: m,
                default: m === molduraAtual
            };
        }));

    const componentes = [new ActionRowBuilder().addComponents(menuMoldura)];

    if (perks.podeCorPerfil) {
        const menuCor = new StringSelectMenuBuilder()
            .setCustomId('cosm_cor')
            .setPlaceholder(t('cosmeticos.placeholder_cor'))
            .addOptions([
                { label: t('cosmeticos.cor_padrao'), value: 'padrao', emoji: '⚪', default: !corAtual },
                ...CORES.map((c) => ({
                    label: t(`cosmeticos.cores.${c.chave}`),
                    value: String(c.valor),
                    emoji: c.emoji,
                    default: c.valor === corAtual
                }))
            ]);
        componentes.push(new ActionRowBuilder().addComponents(menuCor));
    }

    return componentes;
}

async function cosmeticosRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const user = await User.findOne({ id: interaction.user.id }).lean();

    if (!isVipAtivo(user)) {
        return interaction.reply({ embeds: [montarEmbed(user, t)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
        embeds: [montarEmbed(user, t)],
        components: montarComponentes(user, t)
    });
    const mensagem = await interaction.fetchReply();

    const filtro = (i) => i.user.id === interaction.user.id && ['cosm_moldura', 'cosm_cor'].includes(i.customId);
    const coletor = mensagem.createMessageComponentCollector({ filter: filtro, time: 180000 });

    coletor.on('collect', async (i) => {
        const escolha = i.values[0];
        const atualizacao = {};

        if (i.customId === 'cosm_moldura') {
            // Revalida no servidor: o menu poderia ter sido montado quando o
            // VIP ainda estava ativo e ser usado depois de expirar.
            const atual = await User.findOne({ id: interaction.user.id }).lean();
            const perks = getPerks(atual);
            if (!perks.moldurasDisponiveis.includes(escolha)) {
                return i.reply({
                    embeds: [ui.error(t('cosmeticos.indisponivel'), t('cosmeticos.indisponivel_texto'))],
                    flags: MessageFlags.Ephemeral
                });
            }
            atualizacao['cosmetics.moldura'] = escolha;
        } else {
            atualizacao['cosmetics.corPerfil'] = escolha === 'padrao' ? null : Number(escolha);
        }

        const atualizado = await User.findOneAndUpdate(
            { id: interaction.user.id },
            { $set: atualizacao },
            { new: true }
        ).lean();

        await i.update({
            embeds: [montarEmbed(atualizado, t)],
            components: montarComponentes(atualizado, t)
        });
    });

    coletor.on('end', () => {
        mensagem.edit({ components: [] }).catch(() => {});
    });
}

module.exports = cosmeticosRun;
