const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const { tDaInteracao } = require('../../utils/idioma');

/**
 * /help — o manual do jogo, paginado.
 *
 * O conteúdo das páginas mora em `help.paginas` no dicionário, como uma
 * lista de objetos. É o único lugar do bot onde o texto é estrutura e não
 * frase solta — e é proposital: transformar cada linha numa chave própria
 * (`help.p3.cmd2.desc`) tornaria impossível ler ou revisar o manual, e
 * cada comando novo viraria meia dúzia de chaves espalhadas.
 *
 * Entradas com `nome: "​"` (espaço invisível) são notas explicativas, não
 * comandos — aparecem sem o bloco de código.
 */

function paginas(t) {
    return t.dados('help.paginas') || [];
}

function raridades(t) {
    return Object.keys(ui.RARITIES)
        .map((chave) => {
            const meta = ui.getRarity(chave, t.locale);
            return `${meta.emoji} ${meta.label}`;
        })
        .join('  ·  ');
}

function buildEmbed(pageIndex, t) {
    const todas = paginas(t);
    const page = todas[pageIndex];
    if (!page) return ui.error(t('comum.erro'), t('comum.erro_generico'));

    const lista = (page.comandos || [])
        .map((c) => (c.nome === '​' ? c.desc : `\`${c.nome}\`\n└ ${c.desc}`))
        .join('\n');

    return ui.base(ui.STATUS_COLORS.info)
        .setTitle(page.titulo)
        .setDescription(`${page.descricao}\n\n${lista}`)
        .setFooter({
            text: `${ui.BRAND} • ${t('comum.pagina', { atual: pageIndex + 1, total: todas.length })}`
                + ` • ${t('help.raridades')}: ${raridades(t)}`
        });
}

function buildRows(pageIndex, total) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_prev')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex <= 0),
        new ButtonBuilder()
            .setCustomId('help_indicator')
            .setLabel(`${pageIndex + 1} / ${total}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('help_next')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex >= total - 1)
    );
}

async function helpRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const total = paginas(t).length;
    const indexRef = { currentIndex: 0 };

    await interaction.reply({
        embeds: [buildEmbed(indexRef.currentIndex, t)],
        components: [buildRows(indexRef.currentIndex, total)]
    });
    const message = await interaction.fetchReply();

    const filter = i => i.user.id === interaction.user.id && ['help_prev', 'help_next'].includes(i.customId);
    const collector = message.createMessageComponentCollector({ filter, time: 180000 });

    collector.on('collect', async (i) => {
        if (i.customId === 'help_prev') {
            indexRef.currentIndex = Math.max(0, indexRef.currentIndex - 1);
        } else if (i.customId === 'help_next') {
            indexRef.currentIndex = Math.min(total - 1, indexRef.currentIndex + 1);
        }
        await i.update({
            embeds: [buildEmbed(indexRef.currentIndex, t)],
            components: [buildRows(indexRef.currentIndex, total)]
        });
    });

    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}

module.exports = helpRun;
