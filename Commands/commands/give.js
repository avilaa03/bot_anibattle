const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

module.exports = class GiveSlashCommand extends BaseSlashCommand {
  constructor() {
    super('give');
  }
  run(client, interaction) {
    let content = interaction.message ? interaction.message.content : '';
    if (!content) {
      return interaction.reply({ content: 'Não foi possível ler o conteúdo da mensagem.' });
    }

    let input = content.split(' ');
    let recipientId = input[1];
    let amount = input[2];

    if (!recipientId || !amount) {
        return interaction.reply({ content: 'Você precisa especificar um usuário e uma quantia válida.'});
    }

    let giverData = this.getUserData(interaction.user.id);
    let recipientData = this.getUserData(recipientId);

    if (amount > giverData.balance) {
        return interaction.reply({ content: 'Você não tem moedas suficientes para fazer essa transferência.'});
    }

    giverData.balance -= amount;
    recipientData.balance += amount;
    fs.writeFileSync('userData.json', JSON.stringify(userData));

    return interaction.reply({ content: `Você deu ${amount} moedas para o usuário ${recipientId}.`});
  }

  getUserData(userId) {
    let userData = JSON.parse(fs.readFileSync('userData.json'));
    if (!userData[userId]) {
        userData[userId] = { balance: 0 };
        fs.writeFileSync('userData.json', JSON.stringify(userData));
    }
    return userData[userId];
  }

  getSlashCommandJSON() {
    return new SlashCommandBuilder()
    .setName(this.name)
    .setDescription('Dá moedas para outro usuário')
    .toJSON();
  }
}