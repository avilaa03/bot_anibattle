const { Client } = require('discord.js');
const client = new Client({ intents: ["MessageContent"] });
const config = require("./config.json");

client.on("ready", () => {
    console.log(`Bot foi iniciado, com ${client.users.cache.size} usuários, em ${client.channels.cache.size} canais, em ${client.guilds.cache.size} servidores.`);
    client.user.setActivity(`Eu estou em ${client.guilds.cache.size} servidores`);
});

client.on("message", async message => {

});

client.login(config.token);