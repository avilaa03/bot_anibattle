const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const messageCountSchema = require('../../TestFiles/message-count-schema');

module.exports = class BalanceSlashCommand extends BaseSlashCommand {
    constructor() {
        super('balance');
    }

    run(client, interaction) {
        if (interaction.options.getUser('user') == null) {
            let userId = interaction.user.id;
            let userData = this.getUserData(userId);
            let balance = userData.money;
            return interaction.reply({ content: `Você tem ${balance} moedas.`});
        }
        else {
            let mentionedUser = interaction.options.getUser('user');
            let userId = mentionedUser.id;
            let userData = this.getUserData(userId);
            let balance = userData.money;
            if (balance == undefined) {
            return interaction.reply({ content: `O usuário <@${mentionedUser.id}> tem 0 moedas.`});
            } else {
                return interaction.reply({ content: `O usuário <@${mentionedUser.id}> tem ${balance} moedas.`});
            }
        }
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
        .setDescription('Mostra a quantidade de moedas do usuário')
        .addUserOption(option =>
            option
            .setName('user')
            .setDescription('Usuário que deseja mencionar')
            .setRequired(false));
    }
}