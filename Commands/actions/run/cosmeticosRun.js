const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { MOLDURAS, getPerks, isVipAtivo } = require('../../utils/vip');

const CORES = [
    { nome: 'Vermelho', valor: 0xE53935, emoji: '🔴' },
    { nome: 'Azul', valor: 0x2196F3, emoji: '🔵' },
    { nome: 'Verde', valor: 0x4CAF50, emoji: '🟢' },
    { nome: 'Roxo', valor: 0x9C27B0, emoji: '🟣' },
    { nome: 'Dourado', valor: 0xFFD700, emoji: '🟡' },
    { nome: 'Rosa', valor: 0xE91E63, emoji: '🩷' },
    { nome: 'Preto', valor: 0x2C2C2C, emoji: '⚫' }
];

function montarEmbed(user) {
    const perks = getPerks(user);
    const molduraAtual = user?.cosmetics?.moldura || 'nenhuma';
    const corAtual = user?.cosmetics?.corPerfil;

    if (!perks.vip) {
        return ui.warning('Cosméticos', 'Os cosméticos são exclusivos para assinantes.\n\nVeja os planos em `/vip` — a partir de **R$ 5,00/mês** você já desbloqueia molduras de carta e cor de perfil.');
    }

    const nomeCor = CORES.find((c) => c.valor === corAtual)?.nome || 'padrão do bot';

    return ui.base(perks.tier.cor)
        .setTitle('🎨 Seus cosméticos')
        .setDescription(`Plano **${perks.tier.emoji} ${perks.tier.nome}**\n\nEscolha nos menus abaixo. As mudanças valem para todas as suas cartas.`)
        .addFields(
            { name: 'Moldura equipada', value: `${MOLDURAS[molduraAtual]?.nome || 'Padrão'}`, inline: true },
            { name: 'Cor de perfil', value: nomeCor, inline: true },
            {
                name: 'Molduras liberadas no seu plano',
                value: perks.moldurasDisponiveis.map((m) => `• **${MOLDURAS[m]?.nome || m}** — ${MOLDURAS[m]?.descricao || ''}`).join('\n'),
                inline: false
            }
        );
}

function montarComponentes(user) {
    const perks = getPerks(user);
    if (!perks.vip) return [];

    const molduraAtual = user?.cosmetics?.moldura || 'nenhuma';
    const corAtual = user?.cosmetics?.corPerfil;

    const menuMoldura = new StringSelectMenuBuilder()
        .setCustomId('cosm_moldura')
        .setPlaceholder('Escolher moldura de carta')
        .addOptions(perks.moldurasDisponiveis.map((m) => ({
            label: MOLDURAS[m]?.nome || m,
            description: (MOLDURAS[m]?.descricao || '').slice(0, 100),
            value: m,
            default: m === molduraAtual
        })));

    const componentes = [new ActionRowBuilder().addComponents(menuMoldura)];

    if (perks.podeCorPerfil) {
        const menuCor = new StringSelectMenuBuilder()
            .setCustomId('cosm_cor')
            .setPlaceholder('Escolher cor do perfil')
            .addOptions([
                { label: 'Padrão do bot', value: 'padrao', emoji: '⚪', default: !corAtual },
                ...CORES.map((c) => ({
                    label: c.nome,
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
    const user = await User.findOne({ id: interaction.user.id }).lean();

    if (!isVipAtivo(user)) {
        return interaction.reply({ embeds: [montarEmbed(user)], ephemeral: true });
    }

    await interaction.reply({
        embeds: [montarEmbed(user)],
        components: montarComponentes(user)
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
                return i.reply({ embeds: [ui.error('Indisponível', 'Essa moldura não está liberada no seu plano.')], ephemeral: true });
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
            embeds: [montarEmbed(atualizado)],
            components: montarComponentes(atualizado)
        });
    });

    coletor.on('end', () => {
        mensagem.edit({ components: [] }).catch(() => {});
    });
}

module.exports = cosmeticosRun;
