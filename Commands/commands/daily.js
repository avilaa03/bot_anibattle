const fs = require("fs");
const BaseSlashCommand = require("../utils/BaseSlashCommand");
const { SlashCommandBuilder } = require("discord.js");

module.exports = class BalanceSlashCommand extends BaseSlashCommand {
  constructor() {
    super("balance");
  }

  run(client, interaction) {
    const userId = interaction.user.id;
    let userData = JSON.parse(fs.readFileSync("userData.json", "utf8"));
    if (!userData[userId]) {
      userData[userId] = {
        money: 0
      };
    }
    return interaction.reply({
      content: `Você tem ${userData[userId].money} dinheiros.`
    });
  }

  getSlashCommandJSON() {
    return new SlashCommandBuilder()
      .setName(this.name)
      .setDescription("Ver a quantidade de dinheiro do usuário")
      .toJSON();
  }
}

module.exports = class DailySlashCommand extends BaseSlashCommand {
  constructor() {
    super("daily");
  }

  run(client, interaction) {
    const userId = interaction.user.id;
    let userData = JSON.parse(fs.readFileSync("userData.json", "utf8"));
    if (!userData[userId]) {
      userData[userId] = {
        money: 0,
        lastDaily: "Not Collected"
      };
    }

    const today = new Date();
    if (userData[userId].lastDaily === today.toLocaleDateString()) {
      return interaction.reply({
        content: "Você já coletou sua recompensa diária hoje. Tente novamente amanhã."
      });
    }

    const dailyAmount = Math.floor(Math.random() * (100 - 10 + 1) + 10);
    userData[userId].money += dailyAmount;
    userData[userId].lastDaily = today.toLocaleDateString();
    fs.writeFileSync("userData.json", JSON.stringify(userData));
    return interaction.reply({
      content: `Você coletou sua recompensa diária de ${dailyAmount} dinheiros.`
    });
  }

  getSlashCommandJSON() {
    return new SlashCommandBuilder()
      .setName(this.name)
      .setDescription("Coletar recompensa diária de dinheiro")
      .toJSON();
  }
}