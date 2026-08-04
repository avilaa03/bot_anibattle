const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');

const PAGES = [
  {
    titulo: '🎴 Cartas e coleção',
    descricao: 'O básico: consiga cartas e organize sua coleção.',
    comandos: [
      { nome: '/roll', desc: 'Sorteia uma carta aleatória. Você escolhe se guarda ou vende na hora.' },
      { nome: '/inventory', desc: 'Sua coleção completa, ordenada das cartas mais raras para as mais comuns.' },
      { nome: '/show', desc: 'Mostra uma carta que você tem **agora** no inventário, com a arte completa.' },
      { nome: '/favcard', desc: 'Define sua carta favorita — ela aparece no seu perfil.' },
      { nome: '/profile', desc: 'Seu perfil: saldo, coleção, Pokédex e retrospecto de batalhas.' }
    ]
  },
  {
    titulo: '📖 Pokédex',
    descricao: 'Todo carta que passa pelo seu inventário fica registrada para sempre — mesmo que você venda depois.',
    comandos: [
      { nome: '/pokedex', desc: 'Mostra o que você já descobriu e o que ainda falta. Filtra por série, raridade, ou só o que falta.' },
      { nome: '/ficha', desc: 'Consulta a ficha completa de uma carta registrada, por nome ou número. Funciona mesmo se você já vendeu a carta.' },
      { nome: '/colecionadores', desc: 'Ranking de quem já descobriu mais cartas.' },
      { nome: '​', desc: '💡 *Cartas não descobertas aparecem como* ⬛ **???** *— vá atrás delas no `/market` ou no `/roll`.*' },
      { nome: '​', desc: '🔢 *Cada carta tem um número fixo. O* `#042` *de hoje é o mesmo amanhã, mesmo com o catálogo crescendo.*' }
    ]
  },
  {
    titulo: '⚔️ Batalhas',
    descricao: 'Desafie outros jogadores em duelos 3 vs 3 apostando moedas.',
    comandos: [
      { nome: '/battle', desc: 'Desafia outro jogador. A aposta mínima é de 10 moedas, e o vencedor leva o dobro.' },
      { nome: '/treino', desc: 'Batalha amistosa simulada contra o BOT Caviar, para testar suas cartas. Você monta o time normalmente e o BOT usa 3 cartas sorteadas — **não vale moeda, ELO, missão nem conquista**.' },
      { nome: '​', desc: '**Como funciona:** cada rodada é um 1 vs 1. Sua 1ª carta enfrenta a 1ª do oponente, a 2ª contra a 2ª, e assim por diante. Quem vencer 2 das 3 rodadas leva o duelo e o pote.' },
      { nome: '​', desc: '**Atributos:** ⚔️ `ATA` pesa na ordem dos turnos, no crítico e na esquiva · ❤️ `LIF` é a vida · 💥 `POW` é o dano.' },
      { nome: '​', desc: '**Sorte:** existe dano variável, crítico e esquiva — mas tudo pende para a carta melhor. E quem cai abaixo de 40% de vida entra em **modo desespero**, com muito mais chance de crítico. Viradas acontecem.' }
    ]
  },
  {
    titulo: '🪙 Economia e mercado',
    descricao: 'Ganhe moedas e negocie cartas com outros jogadores.',
    comandos: [
      { nome: '/balance', desc: 'Consulta o saldo e o patrimônio de alguém.' },
      { nome: '/magnata', desc: 'Ranking dos 10 jogadores mais ricos.' },
      { nome: '/give', desc: 'Transfere moedas para outro jogador.' },
      { nome: '/quicksell', desc: 'Vende uma carta na hora, pelo valor base.' },
      { nome: '/sell', desc: 'Anuncia uma carta no mercado pelo preço que você quiser (o mercado cobra 5% de taxa na venda).' },
      { nome: '/market', desc: 'Procura e compra cartas anunciadas por outros jogadores.' },
      { nome: '/mymarket', desc: 'Seus anúncios ativos e histórico de vendas.' },
      { nome: '/undosell', desc: 'Retira um anúncio do mercado e devolve a carta ao inventário.' }
    ]
  },
  {
    titulo: '🏆 Progressão',
    descricao: 'Troféus, missões e ranking — o que dá objetivo de longo prazo.',
    comandos: [
      { nome: '/conquistas', desc: 'Seus troféus. 🥉 Bronze, 🥈 Prata, 🥇 Ouro e 💎 **Platina**, que só desbloqueia com todos os outros.' },
      { nome: '/missoes', desc: 'Missões diárias e semanais. O progresso é automático — só volte para resgatar.' },
      { nome: '/ranking', desc: 'Classificação por pontuação de batalha, de Bronze a Mestre.' },
      { nome: '/daily', desc: 'Recompensa diária **com sequência**: quanto mais dias seguidos, mais vale. Marcos em 7, 14, 30, 60 e 100 dias.' },
      { nome: '​', desc: '⚠️ *Faltou um dia? A sequência zera. É de propósito.*' }
    ]
  },
  {
    titulo: '🤝 Social',
    descricao: 'Troque e negocie com outros jogadores.',
    comandos: [
      { nome: '/trocar', desc: 'Troca carta por carta. Os dois montam a oferta e os dois confirmam — mexeu na oferta, as confirmações caem.' },
      { nome: '/desejar', desc: 'Marca uma carta que você quer. Quando alguém rolar ela, você fica sabendo e pode propor uma troca ou uma compra.' },
      { nome: '/desejos', desc: 'Sua lista de desejos, com quantos jogadores também procuram cada carta.' },
      { nome: '​', desc: '💡 *Desejar **não** disputa a carta com ninguém. Quem rolou fica com ela; o aviso serve só para você saber com quem negociar.*' },
      { nome: '/torneio', desc: 'Cria um torneio eliminatório. Entra com um clique e o bot resolve tudo.' }
    ]
  },
  {
    titulo: '✨ VIP e cosméticos',
    descricao: 'Apoie o bot e leve estilo — sem vantagem de combate.',
    comandos: [
      { nome: '/vip', desc: 'Vê os planos e o status da sua assinatura.' },
      { nome: '/cosmeticos', desc: 'Equipa suas molduras de carta e cor de perfil.' },
      { nome: '​', desc: '🛡️ **Nenhum plano dá vantagem de combate.** Atributos, chance de raridade e resultado de batalha são iguais para todos. O que muda é aparência (molduras, cores, emblemas) e conveniência (cooldown e daily).' }
    ]
  },
  {
    titulo: '🎲 Outros',
    descricao: 'Comandos diversos.',
    comandos: [
      { nome: '/help', desc: 'Esta lista de comandos.' },
      { nome: '/info', desc: 'Informações sobre o bot.' },
      { nome: '/ping', desc: 'Testa a latência do bot.' },
      { nome: '/dice', desc: 'Rola um dado de 6 lados.' }
    ]
  }
];

const RARIDADES = Object.values(ui.RARITIES)
  .map((r) => `${r.emoji} ${r.label}`)
  .join('  ·  ');

const TOTAL_PAGES = PAGES.length;

function buildEmbed(pageIndex) {
  const page = PAGES[pageIndex];

  const lista = page.comandos
    .map((c) => (c.nome === '​' ? c.desc : `\`${c.nome}\`\n└ ${c.desc}`))
    .join('\n');

  return ui.base(ui.STATUS_COLORS.info)
    .setTitle(page.titulo)
    .setDescription(`${page.descricao}\n\n${lista}`)
    .setFooter({ text: `${ui.BRAND} • Página ${pageIndex + 1} de ${TOTAL_PAGES} • Raridades: ${RARIDADES}` });
}

function buildRows(pageIndex) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId('help_indicator')
      .setLabel(`${pageIndex + 1} / ${TOTAL_PAGES}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('help_next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex >= TOTAL_PAGES - 1)
  );
}

async function helpRun(client, interaction) {
  const indexRef = { currentIndex: 0 };

  await interaction.reply({
    embeds: [buildEmbed(indexRef.currentIndex)],
    components: [buildRows(indexRef.currentIndex)]
  });
  const message = await interaction.fetchReply();

  const filter = i => i.user.id === interaction.user.id && ['help_prev', 'help_next'].includes(i.customId);
  const collector = message.createMessageComponentCollector({ filter, time: 180000 });

  collector.on('collect', async (i) => {
    if (i.customId === 'help_prev') {
      indexRef.currentIndex = Math.max(0, indexRef.currentIndex - 1);
    } else if (i.customId === 'help_next') {
      indexRef.currentIndex = Math.min(TOTAL_PAGES - 1, indexRef.currentIndex + 1);
    }
    await i.update({
      embeds: [buildEmbed(indexRef.currentIndex)],
      components: [buildRows(indexRef.currentIndex)]
    });
  });

  collector.on('end', () => {
    message.edit({ components: [] }).catch(() => {});
  });
}

module.exports = helpRun;
