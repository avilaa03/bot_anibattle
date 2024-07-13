const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const User = require('../utils/userSchema');

module.exports = class GiveSlashCommand extends BaseSlashCommand {
    constructor() {
        super('give');
    }

    async run(client, interaction) {
        const amount = interaction.options.getNumber('amount');
        const recipient = interaction.options.getUser('user');
        const senderId = interaction.user.id;

        try {
            
            const senderUser = await User.findOne({ id: senderId });
            if (!senderUser || senderUser.balance < amount) {
                return interaction.reply({ content: 'Você não tem dinheiro suficiente!' });
            }

            let recipientUser = await User.findOne({ id: recipient.id });
            if (!recipientUser) {
                recipientUser = new User({ id: recipient.id, balance: 0 }); 
            }

            const confirmationMessage = await interaction.reply({
                content: `Você está prestes a dar ${amount} moedas para o usuário ${recipient.username}. Para confirmar, digite "confirmar". Para cancelar, digite "cancelar".`,
                fetchReply: true
            });

            const filter = m => {
                return m.author.id === senderId && (m.content.toLowerCase() === 'confirmar' || m.content.toLowerCase() === 'cancelar');
            };

            const collector = interaction.channel.createMessageCollector({
                filter,
                time: 30000, 
                max: 1 
            });

            collector.on('collect', async m => {
                if (m.content.toLowerCase() === 'confirmar') {
                    senderUser.balance -= amount;
                    recipientUser.balance += amount;

                    await senderUser.save();
                    await recipientUser.save();

                    interaction.followUp({ content: `Você deu ${amount} moedas para o usuário ${recipient.username}!` });
                } else {
                    interaction.followUp({ content: 'Operação cancelada.' });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.followUp({ content: 'Tempo esgotado. Operação cancelada.' });
                }
            });
        } catch (err) {
            console.error('Erro ao executar o comando give:', err);
            interaction.reply({ content: 'Houve um erro ao executar o comando give.' });
        }
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Dá moedas para outro usuário')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('Usuário que deseja mencionar')
                    .setRequired(true))
            .addNumberOption(option =>
                option
                    .setName('amount')
                    .setDescription('Quantidade de dinheiro')
                    .setMinValue(0)
                    .setMaxValue(9999999999)
                    .setRequired(true));
    }
}
