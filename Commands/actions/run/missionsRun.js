const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const missoes = require('../../utils/missions');
const { verificarConquistas } = require('../../utils/progress');
const { tDaInteracao } = require('../../utils/language');

function barra(atual, alvo, tamanho = 10) {
    const proporcao = alvo > 0 ? Math.min(1, atual / alvo) : 0;
    const cheio = Math.round(proporcao * tamanho);
    return `${'▰'.repeat(cheio)}${'▱'.repeat(tamanho - cheio)}`;
}

function linhaMissao(m, t) {
    const completa = m.progresso >= m.alvo;
    const icone = m.resgatada ? '✅' : completa ? '🎁' : '⬜';
    const status = m.resgatada
        ? ` ${t('missoes_ui.resgatada')}`
        : completa ? ` ${t('missoes_ui.pronta')}` : '';

    // O catálogo de missões só guarda a mecânica; nome e descrição vêm
    // do dicionário pela chave.
    const def = missoes.localizar(m.def, t.locale);

    return `${icone} **${def.nome}**${status}\n`
        + `└ ${def.descricao}\n`
        + `└ ${barra(m.progresso, m.alvo)} ${m.progresso}/${m.alvo} • ${ui.coins(def.recompensa, t.locale)}`;
}

function montarEmbed(lista, username, avatar, t) {
    const todas = [...lista.diarias, ...lista.semanais];
    const prontas = todas.filter((m) => m.progresso >= m.alvo && !m.resgatada);
    const aResgatar = prontas.reduce((s, m) => s + m.def.recompensa, 0);

    // Meia-noite de amanhã: quando as diárias trocam.
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);

    const embed = ui.base(prontas.length > 0 ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.info)
        .setAuthor({ name: t('missoes_ui.autor', { jogador: username }), iconURL: avatar })
        .setTitle(t('missoes_ui.titulo'))
        .addFields(
            {
                name: t('missoes_ui.diarias', { quando: Math.floor(amanha.getTime() / 1000) }),
                value: lista.diarias.length > 0
                    ? lista.diarias.map((m) => linhaMissao(m, t)).join('\n\n')
                    : t('missoes_ui.nenhuma'),
                inline: false
            },
            {
                name: t('missoes_ui.semanais'),
                value: lista.semanais.length > 0
                    ? lista.semanais.map((m) => linhaMissao(m, t)).join('\n\n')
                    : t('missoes_ui.nenhuma'),
                inline: false
            }
        );

    if (prontas.length > 0) {
        embed.setDescription(t('missoes_ui.tem_prontas', {
            n: prontas.length,
            valor: ui.coins(aResgatar, t.locale)
        }));
    } else {
        embed.setDescription(t('missoes_ui.sem_prontas'));
    }

    return embed;
}

async function missoesRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    await interaction.deferReply();

    const lista = await missoes.listar(interaction.user.id);
    const todas = [...lista.diarias, ...lista.semanais];
    const temParaResgatar = todas.some((m) => m.progresso >= m.alvo && !m.resgatada);

    const montarBotoes = (habilitado) => habilitado
        ? [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('missoes_resgatar')
                .setLabel(t('missoes_ui.botao_resgatar'))
                .setEmoji('🎁')
                .setStyle(ButtonStyle.Success)
        )]
        : [];

    const mensagem = await interaction.editReply({
        embeds: [montarEmbed(lista, interaction.user.username, interaction.user.displayAvatarURL(), t)],
        components: montarBotoes(temParaResgatar)
    });

    if (!temParaResgatar) return;

    const filtro = (i) => i.user.id === interaction.user.id && i.customId === 'missoes_resgatar';
    const coletor = mensagem.createMessageComponentCollector({ filter: filtro, time: 120000, max: 1 });

    coletor.on('collect', async (i) => {
        const { total, resgatadas } = await missoes.resgatar(interaction.user.id);

        if (total === 0) {
            return i.update({
                embeds: [ui.neutral(t('missoes_ui.nada_resgatar'), t('missoes_ui.nada_resgatar_texto'))],
                components: []
            });
        }

        const embed = ui.success(
            t('missoes_ui.resgatadas'),
            t('daily.recebeu', { valor: ui.coins(total, t.locale) })
        )
            .addFields({
                name: t('missoes_ui.n_missoes', { n: resgatadas.length }),
                value: resgatadas
                    .map((m) => `• **${missoes.localizar(m, t.locale).nome}** — ${ui.coins(m.recompensa, t.locale)}`)
                    .join('\n'),
                inline: false
            });

        await i.update({ embeds: [embed], components: [] });

        // Resgatar pode ter cruzado o limite de alguma conquista de moeda.
        const novas = await verificarConquistas(interaction.user.id);
        if (novas.length > 0) {
            const { notificarProgresso } = require('../../utils/notifications');
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
