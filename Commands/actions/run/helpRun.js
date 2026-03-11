const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PAGES = [
  [
    { name: '/roll', value: 'Rolar uma carta aleatória (cooldown: 15 min). Você pode enviar ao inventário ou vender. Raridades: common, rare, ultra rare, legendary, master.' },
    { name: '/show', value: 'Mostrar uma carta do inventário pelo nome (com paginação).' },
    { name: '/inventory', value: 'Listar todas as cartas do seu inventário.' },
    { name: '/battle', value: 'Desafiar outro usuário para uma batalha 3v3. Escolha 3 cartas no privado; ATA, LIF e POW definem o combate.' },
    { name: '/magnata', value: 'Ranking dos 10 jogadores mais ricos do bot (por saldo em moedas).' },
    { name: '/favcard', value: 'Definir uma carta como favorita (aparece no perfil).' }
  ],
  [
    { name: '/profile', value: 'Ver seu perfil no AniBattle.' },
    { name: '/sell', value: 'Anunciar uma carta no mercado.' },
    { name: '/undosell', value: 'Remover anúncio do mercado.' },
    { name: '/market', value: 'Comprar ou procurar cartas no mercado.' },
    { name: '/mymarket', value: 'Ver suas cartas anunciadas no mercado.' },
    { name: '/quicksell', value: 'Venda rápida de uma carta pelo nome.' }
  ],
  [
    { name: '/balance', value: 'Ver suas moedas ou as de outro usuário.' },
    { name: '/daily', value: 'Resgatar recompensa diária.' },
    { name: '/give', value: 'Enviar moedas para outro usuário.' },
    { name: '/info', value: 'Informações do bot.' },
    { name: '/ping', value: 'Testar latência.' },
    { name: '/dice', value: 'Rolar um dado (1 a 6).' }
  ]
];

const TOTAL_PAGES = PAGES.length;

function buildEmbed(pageIndex) {
  const page = PAGES[pageIndex];
  return new EmbedBuilder()
    .setTitle('Comandos do AniBattle')
    .setColor(0x0099FF)
    .addFields(page)
    .setFooter({ text: `Página ${pageIndex + 1} de ${TOTAL_PAGES}` });
}

function buildRows(pageIndex) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_prev')
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId('help_next')
      .setLabel('Próximo')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pageIndex >= TOTAL_PAGES - 1)
  );
}

async function helpRun(client, interaction) {
  const indexRef = { currentIndex: 0 };

  const message = await interaction.reply({
    embeds: [buildEmbed(indexRef.currentIndex)],
    components: [buildRows(indexRef.currentIndex)],
    fetchReply: true
  });

  const filter = i => i.user.id === interaction.user.id && ['help_prev', 'help_next'].includes(i.customId);
  const collector = message.createMessageComponentCollector({ filter, time: 120000 });

  collector.on('collect', async (i) => {
    if (i.customId === 'help_prev' && indexRef.currentIndex > 0) {
      indexRef.currentIndex--;
      await i.update({ embeds: [buildEmbed(indexRef.currentIndex)], components: [buildRows(indexRef.currentIndex)] });
    } else if (i.customId === 'help_next' && indexRef.currentIndex < TOTAL_PAGES - 1) {
      indexRef.currentIndex++;
      await i.update({ embeds: [buildEmbed(indexRef.currentIndex)], components: [buildRows(indexRef.currentIndex)] });
    }
  });

  collector.on('end', () => {
    message.edit({ components: [] }).catch(() => {});
  });
}

module.exports = helpRun;
