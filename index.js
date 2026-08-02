const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const mongoose = require('mongoose');
require('dotenv/config');

const { REST, Routes, EmbedBuilder } = require('discord.js');
const { registerCommands } = require('./commands/utils/registry');

// Garante que o estado de batalha seja o mesmo Map em todo o processo (evita cache de módulo diferente)
require('./Commands/utils/battleState');

mongoose.set('strictQuery', false);
mongoose.connection.on('error', (err) => {
  console.error('Erro de conexão com o MongoDB:', err);
});

const client = new Client ({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Reaction,
  ]
});

const CLIENT_ID = process.env.CLIENT_ID;
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.on('interactionCreate', async (interaction) => {
  try {
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
        const embed = new EmbedBuilder()
          .setTitle('❌ Comando indisponível')
          .setDescription('Este comando não está disponível no momento.')
          .setColor('#E53935');
        interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith('battle_pick_')) {
        const { handleBattlePick } = require('./Commands/handlers/battleButtonHandler');
        const handled = await handleBattlePick(client, interaction);
        if (handled) return;
      }
    }
  } catch (err) {
    console.error('interactionCreate error:', err);
    if (interaction.isRepliable() && !interaction.replied) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar sua ação. Tente novamente.')
        .setColor('#E53935');
      // Se já tiver dado deferReply, precisa editar a resposta pendente em
      // vez de tentar responder de novo (o que geraria um outro erro).
      const respond = interaction.deferred
        ? interaction.editReply({ embeds: [embed] })
        : interaction.reply({ embeds: [embed], ephemeral: true });
      respond.catch(() => {});
    }
  }
});

client.on('ready', () => {
  console.log('O bot está pronto (conectado ao Discord).');
});

// Rede de segurança: nunca deixar uma rejeição de Promise sem tratamento
// derrubar o processo inteiro (o bug do /roll acima era exatamente isso).
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
});

// Servidor HTTP mínimo, só para health-check (útil em plataformas de host
// que exigem uma porta aberta para considerar o serviço "vivo").
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('AniBattle está online.');
});

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

  client.slashCommands = new Collection();
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

start().catch((err) => {
  console.error('Erro ao iniciar o bot:', err);
  process.exit(1);
});
