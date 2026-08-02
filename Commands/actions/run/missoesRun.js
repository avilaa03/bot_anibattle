const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const missoes = require('../../utils/missoes');
const { verificarConquistas } = require('../../utils/progresso');

function barra(atual, alvo, tamanho = 10) {
    const proporcao = alvo > 0 ? Math.min(1, atual / alvo) : 0;
    const cheio = Math.round(proporcao * tamanho);
    return `${'▰'.repeat(cheio)}${'▱'.repeat(tamanho - cheio)}`;
}

function linhaMissao(m) {
    const completa = m.progresso >= m.alvo;
    const icone = m.resgatada ? '✅' : completa ? '🎁' : '⬜';
    const status = m.resgatada ? ' *(resgatada)*' : completa ? ' **— pronta!**' : '';

    return `${icone} **${m.def.nome}**${status}\n`
        + `└ ${m.def.descricao}\n`
        + `└ ${barra(m.progresso, m.alvo)} ${m.progresso}/${m.alvo} • ${ui.coins(m.def.recompensa)}`;
}

function montarEmbed(lista, username, avatar) {
    const todas = [...lista.diarias, ...lista.semanais];
    const prontas = todas.filter((m) => m.progresso >= m.alvo && !m.resgatada);
    const aResgatar = prontas.reduce((s, m) => s + m.def.recompensa, 0);

    // Meia-noite de amanhã: quando as diárias trocam.
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);

    const embed = ui.base(prontas.length > 0 ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.info)
        .setAuthor({ name: `Missões de ${username}`, iconURL: avatar })
        .setTitle('📋 Suas missões')
        .addFields(
            {
                name: `📅 Diárias — renovam <t:${Math.floor(amanha.getTime() / 1000)}:R>`,
                value: lista.diarias.length > 0 ? lista.diarias.map(linhaMissao).join('\n\n') : 'Nenhuma.',
                inline: false
            },
            {
                name: '🗓️ Semanais — renovam na segunda-feira',
                value: lista.semanais.length > 0 ? lista.semanais.map(linhaMissao).join('\n\n') : 'Nenhuma.',
                inline: false
            }
        );

    if (prontas.length > 0) {
        embed.setDescription(`🎁 Você tem **${prontas.length}** missão(ões) pronta(s) — ${ui.coins(aResgatar)} esperando!`);
    } else {
        embed.setDescription('Complete as missões jogando normalmente. O progresso é automático.');
    }

    return embed;
}

async function missoesRun(client, interaction) {
    await interaction.deferReply();

    const lista = await missoes.listar(interaction.user.id);
    const todas = [...lista.diarias, ...lista.semanais];
    const temParaResgatar = todas.some((m) => m.progresso >= m.alvo && !m.resgatada);

    const montarBotoes = (habilitado) => habilitado
        ? [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('missoes_resgatar')
                .setLabel('Resgatar recompensas')
                .setEmoji('🎁')
                .setStyle(ButtonStyle.Success)
        )]
        : [];

    const mensagem = await interaction.editReply({
        embeds: [montarEmbed(lista, interaction.user.username, interaction.user.displayAvatarURL())],
        components: montarBotoes(temParaResgatar)
    });

    if (!temParaResgatar) return;

    const filtro = (i) => i.user.id === interaction.user.id && i.customId === 'missoes_resgatar';
    const coletor = mensagem.createMessageComponentCollector({ filter: filtro, time: 120000, max: 1 });

    coletor.on('collect', async (i) => {
        const { total, resgatadas } = await missoes.resgatar(interaction.user.id);

        if (total === 0) {
            return i.update({
                embeds: [ui.neutral('Nada para resgatar', 'Você já resgatou tudo que estava pronto.')],
                components: []
            });
        }

        const embed = ui.success('Recompensas resgatadas', `Você recebeu ${ui.coins(total)}.`)
            .addFields({
                name: `${resgatadas.length} missão(ões)`,
                value: resgatadas.map((m) => `• **${m.nome}** — ${ui.coins(m.recompensa)}`).join('\n'),
                inline: false
            });

        await i.update({ embeds: [embed], components: [] });

        // Resgatar pode ter cruzado o limite de alguma conquista de moeda.
        const novas = await verificarConquistas(interaction.user.id);
        if (novas.length > 0) {
            const { notificarProgresso } = require('../../utils/notificacoes');
            await notificarProgresso(interaction, { conquistas: novas, missoesCompletas: [] });
        }
    });

    coletor.on('end', (coletadas) => {
        if (coletadas.size === 0) {
            mensagem.edit({ components: [] }).catch(() => {});
        }
    });
}

module.exports = missoesRun;
