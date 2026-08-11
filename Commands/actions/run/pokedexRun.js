const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Card = require('../../utils/cardSchema');
const ui = require('../../utils/embeds');
const { escapeRegex } = require('../../utils/regexUtils');
const { getDiscoveredSet } = require('../../utils/discovery');
const discovery = require('../../utils/discovery');
const { formatarNumero } = require('../../utils/dexNumbers');
const { tDaInteracao } = require('../../utils/idioma');

const POR_PAGINA = 10;

function barraProgresso(descobertas, total) {
    const pct = total > 0 ? (descobertas / total) * 100 : 0;
    return `${ui.progressBar(pct, 100, 12)} **${pct.toFixed(1)}%**`;
}

async function pokedexRun(client, interaction) {
    await interaction.deferReply();

    const t = await tDaInteracao(interaction);

    const filtroSerie = (interaction.options.getString('serie') || '').trim();
    const filtroRaridade = (interaction.options.getString('raridade') || '').trim().toLowerCase();
    const apenasFaltantes = interaction.options.getBoolean('faltantes') || false;

    // Duas Pokédex separadas.
    //
    // A normal existe para ser COMPLETADA — a barra é a promessa. Se as
    // cartas de evento entrassem nela, a barra de todo mundo cairia a cada
    // distribuição nova e ninguém mais fecharia 100%: quem não estava no
    // evento não tem como conseguir.
    //
    // Separando, cada uma mede o que dá para medir. A normal continua
    // fechável; a de evento é o mural do que você participou.
    const dex = interaction.options.getString('dex') === 'evento' ? 'evento' : 'normal';

    const query = { ...discovery.filtroDaDex(dex) };
    if (filtroSerie) query.series = new RegExp(escapeRegex(filtroSerie), 'i');
    // A raridade só filtra dentro da dex normal: na de evento todas são
    // `event`, e deixar escolher outra devolveria uma lista sempre vazia.
    if (filtroRaridade && dex === 'normal') query.rarity = filtroRaridade;

    const [descobertoSet, cartas] = await Promise.all([
        getDiscoveredSet(interaction.user.id),
        Card.find(query).select('numero name series rarity overall').lean()
    ]);

    if (cartas.length === 0) {
        return interaction.editReply({
            embeds: [ui.neutral(
                t(dex === 'evento' ? 'pokedex.titulo_eventos' : 'pokedex.titulo'),
                t(dex === 'evento' ? 'pokedex.sem_eventos' : 'pokedex.sem_resultado')
            )]
        });
    }

    // Ordena pelo número da dex — é o que faz a lista bater com o número
    // que o jogador vê na `/ficha`. Cartas ainda sem número vão para o fim.
    cartas.sort((a, b) => {
        if (a.numero == null && b.numero == null) {
            return String(a.name).localeCompare(String(b.name), 'pt-BR');
        }
        if (a.numero == null) return 1;
        if (b.numero == null) return -1;
        return a.numero - b.numero;
    });

    const totalNoFiltro = cartas.length;
    const descobertasNoFiltro = cartas.filter((c) => descobertoSet.has(String(c._id))).length;

    const listadas = apenasFaltantes
        ? cartas.filter((c) => !descobertoSet.has(String(c._id)))
        : cartas;

    if (listadas.length === 0) {
        return interaction.editReply({
            embeds: [ui.success(t('pokedex.completa'), t('pokedex.completa_texto'))]
        });
    }

    const totalPaginas = Math.ceil(listadas.length / POR_PAGINA);

    const montarEmbed = (pagina) => {
        const inicio = pagina * POR_PAGINA;
        const fatia = listadas.slice(inicio, inicio + POR_PAGINA);

        const linhas = fatia.map((carta) => {
            // Número fixo da carta, não a posição na lista — assim o que
            // aparece aqui é o mesmo número que a `/ficha` mostra.
            const numero = formatarNumero(carta.numero, totalNoFiltro);
            const achou = descobertoSet.has(String(carta._id));
            const meta = ui.getRarity(carta.rarity, t.locale);

            if (!achou) {
                // Carta não descoberta aparece censurada, como na Pokédex.
                return `\`${numero}\` ⬛ **???** — *${carta.series}*`;
            }
            return `\`${numero}\` ${meta.emoji} **${ui.cardName(carta)}** — ${t('atributos.ovr')} **${carta.overall}**\n└ *${carta.series}*`;
        }).join('\n');

        const titulo = dex === 'evento'
            ? t('pokedex.titulo_eventos')
            : filtroSerie || filtroRaridade
            ? t('pokedex.titulo_filtrado', {
                filtro: filtroSerie || ui.getRarity(filtroRaridade, t.locale).label
            })
            : t('pokedex.titulo');

        return ui.base(ui.STATUS_COLORS.info)
            .setAuthor({
                name: t('pokedex.autor', { jogador: interaction.user.username }),
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTitle(titulo)
            .setDescription(
                `${barraProgresso(descobertasNoFiltro, totalNoFiltro)}\n`
                + `${t('pokedex.contagem', { descobertas: descobertasNoFiltro, total: totalNoFiltro })}\n\n${linhas}`
            )
            .setFooter({
                text: `${ui.BRAND} • ${t('comum.pagina', { atual: pagina + 1, total: totalPaginas })}`
                    + (apenasFaltantes ? ` • ${t('pokedex.so_faltantes')}` : '')
            });
    };

    const montarBotoes = (pagina) => [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pokedex_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(pagina <= 0),
        new ButtonBuilder().setCustomId('pokedex_page').setLabel(`${pagina + 1} / ${totalPaginas}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('pokedex_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(pagina >= totalPaginas - 1)
    )];

    let paginaAtual = 0;
    const mensagem = await interaction.editReply({
        embeds: [montarEmbed(paginaAtual)],
        components: montarBotoes(paginaAtual)
    });

    const filtro = (i) => i.user.id === interaction.user.id && ['pokedex_prev', 'pokedex_next'].includes(i.customId);
    const coletor = mensagem.createMessageComponentCollector({ filter: filtro, time: 180000 });

    coletor.on('collect', async (i) => {
        if (i.customId === 'pokedex_prev') paginaAtual = Math.max(0, paginaAtual - 1);
        else paginaAtual = Math.min(totalPaginas - 1, paginaAtual + 1);

        await i.update({ embeds: [montarEmbed(paginaAtual)], components: montarBotoes(paginaAtual) });
    });

    coletor.on('end', () => {
        mensagem.edit({ components: [] }).catch(() => {});
    });
}

module.exports = pokedexRun;
