const { Client, GatewayIntentBits, Partials, Collection, resolveColor } = require("discord.js");
const mongoose = require('mongoose');
require('dotenv/config');
const fs = require("fs");

const { REST, Routes } = require('discord.js');
const { registerCommands } = require('./commands/utils/registry');
// const { GiveMoneySlashCommand } = require('./Commands/commands/give.js');


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

// const giveMoneyCommand = new GiveMoneySlashCommand(client);
// const dailyCommand = new DailyCommand(client);
// const balanceCommand = new BalanceCommand(client);

const CLIENT_ID = process.env.CLIENT_ID;

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.on('interactionCreate', (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const cmd = client.slashCommands.get(commandName);
    if (cmd) {
      cmd.run(client, interaction);
    } else {
      interaction.reply({ content: 'This command has no run method.'});
    }
  } else if (interaction.isButton())  {    
    if (interaction.customId === 'enviarInventario') {
      interaction.reply('enviado essa budega')
    }

  }
});




(async () => {
  try {
    client.slashCommands = new Collection();
    await registerCommands(client, '../commands');
    // console.log(client.slashCommands);
    const slashCommandsJson = client.slashCommands.map(
      (cmd) => cmd.getSlashCommandJSON()
      );
      // console.log(slashCommandsJson);
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { 
      body: [
        ...slashCommandsJson, 
        {
      name: 'testcmd',
      description: 'hello world',
        },
      ],
     });
    const registeredSlashCommands = await client.rest.get(
      Routes.applicationCommands(CLIENT_ID)
    );
    // console.log(registeredSlashCommands);
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

// client.on("message", async (message) => {
//   giveMoneyCommand.handle(message);
//   dailyCommand.handle(message);
//   balanceCommand.handle(message);
// });

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

var express = require('express');
var app = express();

app.get('/', function(req, res){
   res.send("Hello world!");
});

app.listen(3000);

app.post('/inserir', function(req, res){
  console.log(req);
  res.send({
    "nome": req.body
  });
});

const bodyParser = require('body-parser');

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


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