const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const { tDaInteracao } = require('../../utils/idioma');

/**
 * O manual inteiro vem do dicionário, por `t.dados('help.paginas')`.
 *
 * É conteúdo que tem ESTRUTURA — uma lista de páginas, cada uma com
 * título, descrição e a lista de comandos. Espremer isso em chaves soltas
 * (`help.p1.cmd3.desc`) deixaria o dicionário ilegível e quebraria a cada
 * comando novo. Ver a nota de `i18n.dados()`.
 *
 * O nome do comando (`/roll`) NÃO se traduz: é o que o jogador digita.
 */
function paginas(t) {
  return t.dados('help.paginas') || [];
}

function buildEmbed(pageIndex, t) {
  const todas = paginas(t);
  const page = todas[pageIndex];

  const lista = page.comandos
    .map((c) => (c.nome === '​' ? c.desc : `\`${c.nome}\`\n└ ${c.desc}`))
    .join('\n');

  // As raridades saem de `getRarity`, não de `ui.RARITIES`: o catálogo
  // guarda só a mecânica, e ler `.label` dele devolve `undefined`.
  const raridades = Object.keys(ui.RARITIES)
    .map((chave) => {
      const meta = ui.getRarity(chave, t.locale);
      return `${meta.emoji} ${meta.label}`;
    })
    .join('  ·  ');

  return ui.base(ui.STATUS_COLORS.info)
    .setTitle(page.titulo)
    .setDescription(`${page.descricao}\n\n${lista}`)
    .setFooter({
      text: `${ui.BRAND} • ${t('comum.pagina', { atual: pageIndex + 1, total: todas.length })}`
        + ` • ${t('help.raridades')}: ${raridades}`
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
