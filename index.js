const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js')
const mongoose = require('mongoose')
require('dotenv/config')

const { REST, Routes } = require('discord.js');
const { registerCommands } = require('./commands/utils/registry');

const client = new Client ({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Reaction,
  ]
})

const CLIENT_ID = process.env.CLIENT_ID;

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    client.slashCommands = new Collection();
    await registerCommands(client, '../commands');

    console.log('Started refreshing application (/) commands.');

    // await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

client.on('ready', () => {
  console.log("The bot is ready")

  mongoose.connect(process.env.MONGODB_URI, {
    keepAlive: true,
  });
})

client.on('interactionCreate', (interaction) => {
  if(interaction.isChatInputCommand()) {
    console.log('Pong!');
    interaction.reply({ content: 'Pong!'})
    console.log(interaction);
  }

})

// client.on('messageCreate', async (message) => {
//   await messageCountSchema.findOneAndUpdate({
//     _id: message.author.id
//   }, {
//     _id: message.author.id,
//     $inc: {
//       messageCount: 1
//     }
//   }, {
//     upsert: true
//   })
// });

// client.on('messageCreate', async (message) => {
//   if (message.content === "ping") {
//     const reply = await message.reply('pong')
//     reply.react('🇧🇴')
//   }
// })

// client.on('messageReactionAdd', async (reaction) => {
//   if (reaction.partial) {
//     await reaction.fetch()
//   }
//   console.log(reaction)
// })

client.login(process.env.TOKEN)