const { Client, GatewayIntentBits, Partials, Collection, Events, MessageFlags } = require("discord.js");
const mongoose = require('mongoose');
require('dotenv/config');

const { REST, Routes, EmbedBuilder } = require('discord.js');
// ATENÇÃO AO "C" MAIÚSCULO. A pasta no disco chama-se "Commands".
//
// O macOS tem sistema de arquivos que não diferencia maiúsculas, então
// `./commands/...` e `./Commands/...` abrem o mesmo arquivo. Mas o Node
// guarda os módulos em cache pela STRING do caminho — então os dois
// grafias viram dois módulos independentes, cada um com seu próprio
// estado. O sintoma disso foi o "Cannot overwrite `Card` model once
// compiled": o schema era carregado duas vezes e registrava o model duas
// vezes no mongoose.
//
// Em Linux (VPS) seria pior: `./commands` simplesmente não existiria e o
// bot nem subiria.
const { registerCommands } = require('./Commands/utils/registry');

const { recoverPendingBattles, sweepStaleBattles } = require('./Commands/utils/battleState');
const monitoring = require('./Commands/utils/monitoring');

// Iniciar o monitoramento antes de tudo, para capturar até erro de boot.
monitoring.iniciar();

mongoose.set('strictQuery', false);
mongoose.connection.on('error', (err) => {
  monitoring.capturarErro(err, { origem: 'mongodb' });
});

// Nenhum intent privilegiado aqui de propósito.
//
// O bot já usou MessageContent (para ler "confirmar" no /give e o número
// da carta no /market). Os dois viraram botões e menu de seleção, então o
// intent deixou de ser necessário — e com isso o bot não precisa passar
// pela aprovação de intents privilegiados que o Discord exige acima de
// 10.000 usuários.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel, // necessário para receber interações em DM
  ]
});

const CLIENT_ID = process.env.CLIENT_ID;
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const { bloquearSeBanido } = require('./Commands/utils/moderacao');
const presenca = require('./Commands/utils/presenca');
const { tDaInteracao } = require('./Commands/utils/idioma');
const { criarT, DEFAULT_LOCALE } = require('./Commands/utils/i18n');

client.on('interactionCreate', async (interaction) => {
  try {
    // Porteiro: conta suspensa não passa daqui. Fica antes de tudo de
    // propósito — se a checagem estivesse dentro de cada comando, bastaria
    // esquecer de um para o banido continuar jogando por ele.
    if (interaction.isChatInputCommand() || interaction.isButton() || interaction.isStringSelectMenu()) {
      if (await bloquearSeBanido(interaction)) return;
    }

    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;
      const cmd = client.slashCommands.get(commandName);
      if (cmd) {
        // Precisa de "await": sem isso, um erro dentro do comando vira uma
        // Promise rejeitada sem tratamento e derruba o processo inteiro do
        // bot (foi exatamente o que aconteceu no crash do /roll), em vez de
        // cair no catch logo abaixo.
        await cmd.run(client, interaction);
      } else {
        const t = await tDaInteracao(interaction);
        const embed = new EmbedBuilder()
          .setTitle(`❌ ${t('comum.comando_indisponivel')}`)
          .setDescription(t('comum.comando_indisponivel_texto'))
          .setColor('#E53935');
        interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      if (id.startsWith('battle_pick_')) {
        const { handleBattlePick } = require('./Commands/handlers/battleButtonHandler');
        if (await handleBattlePick(client, interaction)) return;
      } else if (id.startsWith('trade_')) {
        const { handleTrade } = require('./Commands/handlers/tradeHandler');
        if (await handleTrade(client, interaction)) return;
      } else if (id.startsWith('tn_')) {
        const { handleTournament } = require('./Commands/handlers/tournamentHandler');
        if (await handleTournament(client, interaction)) return;
      }
    }
  } catch (err) {
    monitoring.capturarErro(err, {
      origem: 'interactionCreate',
      comando: interaction.isChatInputCommand?.() ? interaction.commandName : interaction.customId,
      usuarioId: interaction.user?.id,
      guildId: interaction.guildId
    });
    if (interaction.isRepliable() && !interaction.replied) {
      // Resolver o idioma aqui pode falhar (é o caminho de erro, afinal),
      // então o catch cai no português em vez de deixar o jogador sem
      // resposta nenhuma.
      const t = await tDaInteracao(interaction).catch(() => criarT(DEFAULT_LOCALE));
      const embed = new EmbedBuilder()
        .setTitle(`❌ ${t('comum.erro')}`)
        .setDescription(t('comum.erro_generico'))
        .setColor('#E53935');
      // Se já tiver dado deferReply, precisa editar a resposta pendente em
      // vez de tentar responder de novo (o que geraria um outro erro).
      const respond = interaction.deferred
        ? interaction.editReply({ embeds: [embed] })
        : interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      respond.catch(() => {});
    }
  }
});

// Usamos a constante em vez da string literal: o discord.js renomeou
// 'ready' para 'clientReady' na v14.22 (em v15 só o nome novo existe), e
// `Events.ClientReady` sempre aponta para o nome certo da versão instalada.
client.on(Events.ClientReady, () => {
  console.log('O bot está pronto (conectado ao Discord).');
  // Publica servidores e sinal de vida para o painel do site.
  presenca.iniciar(client);
});

// Rede de segurança: nunca deixar uma rejeição de Promise sem tratamento
// derrubar o processo inteiro (o bug do /roll acima era exatamente isso).
process.on('unhandledRejection', (err) => {
  monitoring.capturarErro(err, { origem: 'unhandledRejection' });
});

// Exceção não tratada é grave: registramos, damos tempo de enviar e saímos.
// O gerenciador de processo (PM2/systemd) reinicia o bot.
process.on('uncaughtException', async (err) => {
  monitoring.capturarErro(err, { origem: 'uncaughtException' });
  await monitoring.encerrar(2000);
  process.exit(1);
});

// Encerramento limpo: fecha a conexão do banco e envia o que estiver
// pendente no monitoramento antes de morrer.
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    console.log(`\nRecebido ${sinal}, encerrando...`);
    presenca.parar();
    await presenca.marcarOffline();
    await monitoring.encerrar(2000);
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  });
}

// Servidor HTTP mínimo, só para health-check (útil em plataformas de host
// que exigem uma porta aberta para considerar o serviço "vivo").
const express = require('express');
const { criarRotaPagamento } = require('./Commands/utils/paymentWebhook');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('AniBattle está online.');
});

// Webhook de pagamento (ativa VIP). Fica desligado se
// PAYMENT_WEBHOOK_SECRET não estiver configurado no .env.
app.use(criarRotaPagamento(client));

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI não definido no .env — encerrando.');
    process.exit(1);
  }

  // Conecta no MongoDB ANTES de logar no Discord e antes de aceitar
  // interações. Antes, a conexão só era iniciada dentro do evento "ready"
  // do client — como o bot já passa a receber /comandos assim que fica
  // pronto, um /roll disparado rápido demais podia estourar os 3 segundos
  // que o Discord dá para responder (erro "Unknown interaction", 10062),
  // porque a query no Mongo ainda estava esperando a conexão terminar.
  await mongoose.connect(process.env.MONGODB_URI, { keepAlive: true });
  console.log('Conectado ao MongoDB.');

  // Batalhas que ficaram penduradas de uma execução anterior: as apostas
  // estavam retidas pelo bot, então precisam voltar para os jogadores.
  const recuperadas = await recoverPendingBattles();
  if (recuperadas.canceladas > 0) {
    console.log(`Recuperação: ${recuperadas.canceladas} batalha(s) pendente(s) cancelada(s), ${recuperadas.devolvido} moeda(s) devolvida(s).`);
  }

  // Varredura periódica: duelos, trocas e torneios abandonados.
  setInterval(async () => {
    try {
      const resultado = await sweepStaleBattles();
      if (resultado.canceladas > 0) {
        console.log(`Varredura: ${resultado.canceladas} batalha(s) abandonada(s), ${resultado.devolvido} moeda(s) devolvida(s).`);
      }

      const { limparAbandonadas } = require('./Commands/utils/trade');
      const trocas = await limparAbandonadas();
      if (trocas > 0) console.log(`Varredura: ${trocas} troca(s) abandonada(s) removida(s).`);

      const { limparAbandonados } = require('./Commands/utils/tournament');
      const torneios = await limparAbandonados();
      if (torneios > 0) console.log(`Varredura: ${torneios} torneio(s) abandonado(s) cancelado(s).`);
    } catch (err) {
      monitoring.capturarErro(err, { origem: 'varreduraPeriodica' });
    }
  }, 5 * 60 * 1000);

  client.slashCommands = new Collection();
  // "../commands" é relativo a Commands/utils/, ou seja: Commands/commands/.
  // A grafia minúscula aqui é a correta — essa pasta existe assim no disco.
  await registerCommands(client, '../commands');
  const slashCommandsJson = client.slashCommands.map((cmd) => cmd.getSlashCommandJSON());
  console.log('Started refreshing application (/) commands.');
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommandsJson });
  console.log('Successfully reloaded application (/) commands.');

  app.listen(PORT, () => {
    console.log(`Health-check HTTP ouvindo na porta ${PORT}`);
  });

  await client.login(process.env.TOKEN);
}

start().catch(async (err) => {
  monitoring.capturarErro(err, { origem: 'boot' });
  await monitoring.encerrar(2000);
  process.exit(1);
});
