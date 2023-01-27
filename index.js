const { Client, GatewayIntentBits, Partials } = require('discord.js')
const mongoose = require('mongoose')
require('dotenv/config')

const WhoisSlashCommand = require('./commands/whois');
const messageCountSchema = require("./TestFiles/message-count-schema")
const commands = require('./Commands/register')

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