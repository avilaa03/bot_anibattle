const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

module.exports = class GiveSlashCommand extends BaseSlashCommand {
  constructor() {
    super('give');
  }
  run(client, interaction) {
    const amount = interaction.options.getNumber('amount');
    const recipient = interaction.options.getUser('user');

    let userData = {};
    try {
        userData = JSON.parse(fs.readFileSync('userData.json', 'utf-8'));
    } catch (e) {
        console.error(e);
    }

    const senderId = interaction.user.id;
    if (!userData[senderId]) {
        userData[senderId] = { money: 0 };
    }

    if (userData[senderId].money < amount) {
        return interaction.reply({ content: 'Você não tem dinheiro suficiente!'});
    }

    if (!userData[recipient.id]) {
        userData[recipient.id] = { money: 0 };
    }

    userData[senderId].money -= amount;
    userData[recipient.id].money += amount;

    fs.writeFileSync('userData.json', JSON.stringify(userData));

    return interaction.reply({ content: `Você deu ${amount} para o usuário ${recipient.username}!`});
}

  getSlashCommandJSON() {
    return new SlashCommandBuilder()
    .setName(this.name)
    .setDescription('Dá moedas para outro usuário')
    .addUserOption( option =>
      option
      .setName('user')
      .setDescription('Usuário que deseja mencionar')
      .setRequired(true))
    .addNumberOption( option =>
      option
      .setName('amount')
      .setDescription('Quantidade de dinheiro')
      .setMinValue(0)
      .setMaxValue(9999999999)
      .setRequired(true));
  }
}