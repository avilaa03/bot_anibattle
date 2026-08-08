const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const achievements = require('../../utils/achievements');
const { montarContexto, verificarConquistas } = require('../../utils/progresso');
const { tDaInteracao } = require('../../utils/idioma');

const POR_PAGINA = 8;

function barra(atual, alvo, tamanho = 10) {
    const proporcao = alvo > 0 ? Math.min(1, atual / alvo) : 0;
    const cheio = Math.round(proporcao * tamanho);
    return `${'▰'.repeat(cheio)}${'▱'.repeat(tamanho - cheio)}`;
}

async function conquistasRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const alvo = interaction.options.getUser('user') || interaction.user;
    const ehProprio = alvo.id === interaction.user.id;

    await interaction.deferReply();

    // Aproveita a consulta para desbloquear o que estiver pendente —
    // assim quem cumpriu o requisito antes do sistema existir recebe
    // o troféu na primeira vez que abrir a tela.
    if (ehProprio) await verificarConquistas(alvo.id);

    const user = await User.findOne({ id: alvo.id }).lean();
    if (!user) {
        return interaction.editReply({
            embeds: [ui.error(t('comum.perfil_nao_encontrado'), ehProprio
                ? t('balance.sem_perfil_voce')
                : t('balance.sem_perfil_outro', { jogador: alvo.username }))]
        });
    }

    const conquistadas = new Map((user.conquistas || []).map((c) => [c.chave, c.desbloqueadaEm]));
    const contexto = await montarContexto(user);
    const todas = achievements.todas();

    const pontos = achievements.pontos([...conquistadas.keys()]);
    const nivel = achievements.nivel(pontos);

    // Contagem por tipo, no formato do card de troféus da PSN.
    const totais = achievements.contagemPorTipo();
    const obtidos = { bronze: 0, prata: 0, ouro: 0, platina: 0 };
    for (const chave of conquistadas.keys()) {
        const c = achievements.porChave(chave);
        if (c) obtidos[c.tipo]++;
    }

    const percentual = (conquistadas.size / todas.length) * 100;
    const temPlatina = conquistadas.has('platina');

    const resumo = Object.keys(totais)
        .map((tipo) => `${achievements.TIPOS[tipo].emoji} **${obtidos[tipo]}**/${totais[tipo]}`)
        .join('   ');

    // Ordena: conquistadas primeiro (mais raras no topo), depois as que
    // faltam ordenadas por proximidade — é o que dá vontade de perseguir.
    const ordenadas = [...todas].sort((a, b) => {
        const temA = conquistadas.has(a.chave);
        const temB = conquistadas.has(b.chave);
        if (temA !== temB) return temA ? -1 : 1;
        return achievements.TIPOS[b.tipo].peso - achievements.TIPOS[a.tipo].peso;
    });

    const totalPaginas = Math.ceil(ordenadas.length / POR_PAGINA);

    const montarEmbed = (pagina) => {
        const inicio = pagina * POR_PAGINA;
        const fatia = ordenadas.slice(inicio, inicio + POR_PAGINA);

        const linhas = fatia.map((c) => {
            const tipo = achievements.TIPOS[c.tipo];
            const info = achievements.localizar(c, t.locale);
            const tem = conquistadas.has(c.chave);

            if (tem) {
                const quando = conquistadas.get(c.chave);
                const data = quando ? `<t:${Math.floor(new Date(quando).getTime() / 1000)}:d>` : '';
                return `${tipo.emoji} **${info.nome}** ✅\n└ ${info.descricao} ${data}`;
            }

            // Platina bloqueada mostra quantos faltam.
            if (c.chave === 'platina') {
                const faltam = achievements.CONQUISTAS.length - (conquistadas.size - (temPlatina ? 1 : 0));
                return `${tipo.emoji} **${info.nome}** 🔒\n└ ${info.descricao} — ${t('conquistas_ui.faltam', { n: faltam })}`;
            }

            let extra = '';
            if (typeof c.progresso === 'function') {
                try {
                    const p = c.progresso(contexto);
                    extra = `\n└ ${barra(p.atual, p.alvo)} ${ui.number(Math.min(p.atual, p.alvo), t.locale)}/${ui.number(p.alvo, t.locale)}`;
                } catch (err) { /* progresso é opcional */ }
            }
            return `${tipo.emoji} **${info.nome}** 🔒\n└ ${info.descricao}${extra}`;
        }).join('\n');

        return ui.base(temPlatina ? achievements.TIPOS.platina.cor : ui.STATUS_COLORS.info)
            .setAuthor({ name: t('conquistas_ui.autor', { jogador: alvo.username }), iconURL: alvo.displayAvatarURL() })
            .setTitle(temPlatina ? t('conquistas_ui.platinado') : t('conquistas_ui.titulo'))
            .setDescription(
                `${resumo}\n\n` +
                `${barra(conquistadas.size, todas.length, 16)} **${percentual.toFixed(0)}%**\n` +
                `${t('conquistas_ui.resumo', {
                    obtidos: conquistadas.size,
                    total: todas.length,
                    nivel,
                    pontos: ui.number(pontos, t.locale)
                })}\n\n` +
                linhas
            )
            .setFooter({ text: `${ui.BRAND} • ${t('comum.pagina', { atual: pagina + 1, total: totalPaginas })}` });
    };

    const montarBotoes = (pagina) => [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('conq_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(pagina <= 0),
        new ButtonBuilder().setCustomId('conq_page').setLabel(`${pagina + 1} / ${totalPaginas}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('conq_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(pagina >= totalPaginas - 1)
    )];

    let pagina = 0;
    const mensagem = await interaction.editReply({
        embeds: [montarEmbed(pagina)],
        components: montarBotoes(pagina)
    });

    const filtro = (i) => i.user.id === interaction.user.id && ['conq_prev', 'conq_next'].includes(i.customId);
    const coletor = mensagem.createMessageComponentCollector({ filter: filtro, time: 180000 });

    coletor.on('collect', async (i) => {
        pagina = i.customId === 'conq_prev'
            ? Math.max(0, pagina - 1)
            : Math.min(totalPaginas - 1, pagina + 1);
        await i.update({ embeds: [montarEmbed(pagina)], components: montarBotoes(pagina) });
    });

    coletor.on('end', () => {
        mensagem.edit({ components: [] }).catch(() => {});
    });
}

module.exports = conquistasRun;
