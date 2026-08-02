const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Card = require('../../utils/cardSchema');
const ui = require('../../utils/embeds');
const { escapeRegex } = require('../../utils/regexUtils');
const { getDiscoveredSet } = require('../../utils/discovery');

const POR_PAGINA = 10;

function barraProgresso(descobertas, total) {
    const pct = total > 0 ? (descobertas / total) * 100 : 0;
    return `${ui.progressBar(pct, 100, 12)} **${pct.toFixed(1)}%**`;
}

async function pokedexRun(client, interaction) {
    await interaction.deferReply();

    const filtroSerie = (interaction.options.getString('serie') || '').trim();
    const filtroRaridade = (interaction.options.getString('raridade') || '').trim().toLowerCase();
    const apenasFaltantes = interaction.options.getBoolean('faltantes') || false;

    const query = {};
    if (filtroSerie) query.series = new RegExp(escapeRegex(filtroSerie), 'i');
    if (filtroRaridade) query.rarity = filtroRaridade;

    const [descobertoSet, cartas] = await Promise.all([
        getDiscoveredSet(interaction.user.id),
        Card.find(query).select('name series rarity overall').lean()
    ]);

    if (cartas.length === 0) {
        return interaction.editReply({
            embeds: [ui.neutral('📖 Pokédex', 'Nenhuma carta encontrada com esses filtros.')]
        });
    }

    // Ordena por raridade (mais rara primeiro) e depois por nome, para a
    // lista ficar previsível entre uma consulta e outra.
    cartas.sort((a, b) => {
        const porRaridade = ui.compareRarityDesc(a.rarity, b.rarity);
        if (porRaridade !== 0) return porRaridade;
        return String(a.name).localeCompare(String(b.name), 'pt-BR');
    });

    const totalNoFiltro = cartas.length;
    const descobertasNoFiltro = cartas.filter((c) => descobertoSet.has(String(c._id))).length;

    const listadas = apenasFaltantes
        ? cartas.filter((c) => !descobertoSet.has(String(c._id)))
        : cartas;

    if (listadas.length === 0) {
        return interaction.editReply({
            embeds: [ui.success('📖 Pokédex completa!', 'Você já descobriu todas as cartas desse filtro. 🎉')]
        });
    }

    const totalPaginas = Math.ceil(listadas.length / POR_PAGINA);

    const montarEmbed = (pagina) => {
        const inicio = pagina * POR_PAGINA;
        const fatia = listadas.slice(inicio, inicio + POR_PAGINA);

        const linhas = fatia.map((carta, i) => {
            const numero = String(inicio + i + 1).padStart(3, '0');
            const achou = descobertoSet.has(String(carta._id));
            const meta = ui.getRarity(carta.rarity);

            if (!achou) {
                // Carta não descoberta aparece censurada, como na Pokédex.
                return `\`#${numero}\` ⬛ **???** — *${carta.series}*`;
            }
            return `\`#${numero}\` ${meta.emoji} **${ui.cardName(carta.name)}** — OVR **${carta.overall}**\n└ *${carta.series}*`;
        }).join('\n');

        const titulo = filtroSerie || filtroRaridade
            ? `📖 Pokédex — ${filtroSerie || ui.getRarity(filtroRaridade).label}`
            : '📖 Pokédex';

        return ui.base(ui.STATUS_COLORS.info)
            .setAuthor({ name: `Pokédex de ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTitle(titulo)
            .setDescription(`${barraProgresso(descobertasNoFiltro, totalNoFiltro)}\n**${descobertasNoFiltro}** de **${totalNoFiltro}** cartas descobertas\n\n${linhas}`)
            .setFooter({ text: `${ui.BRAND} • Página ${pagina + 1} de ${totalPaginas}${apenasFaltantes ? ' • mostrando só as que faltam' : ''}` });
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
