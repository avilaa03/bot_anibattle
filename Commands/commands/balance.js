const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const User = require('../utils/userSchema');

module.exports = class BalanceSlashCommand extends BaseSlashCommand {
    constructor() {
        super('balance');
    }

    async run(client, interaction) {
        let userId;
        if (interaction.options.getUser('user') == null) {
            userId = interaction.user.id;
        } else {
            const mentionedUser = interaction.options.getUser('user');
            userId = mentionedUser.id;
        }

        try {
            
            const user = await User.findOne({ id: userId });

            if (!user || user.balance === undefined) {
                return interaction.reply({ content: `O usuário <@${userId}> não foi encontrado ou não possui saldo registrado.` });
            }

            return interaction.reply({ content: `O usuário <@${userId}> tem ${user.balance} moedas.` });
        } catch (err) {
            console.error('Erro ao buscar o saldo do usuário:', err);
            return interaction.reply('Houve um erro ao buscar o saldo do usuário.');
        }
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
