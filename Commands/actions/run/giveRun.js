const User = require('../../utils/userSchema');
const { EmbedBuilder } = require('discord.js');
const { giveCollect } = require('../collect/giveCollect.js');

async function giveRun(client, interaction) {
    const amount = interaction.options.getNumber('amount');
    const recipient = interaction.options.getUser('user');
    const senderId = interaction.user.id;

    try {
        const senderUser = await User.findOne({ id: senderId });
        if (!senderUser || senderUser.balance < amount) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Saldo insuficiente')
                .setDescription('Você não tem dinheiro suficiente para essa transferência.')
                .setColor('#E53935');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        let recipientUser = await User.findOne({ id: recipient.id });
        if (!recipientUser) {
            recipientUser = new User({ id: recipient.id, balance: 0 });
        }

        const embed = new EmbedBuilder()
            .setTitle('💸 Confirmar transferência')
            .setColor('#FF9800')
            .setDescription(`Você está prestes a enviar **${amount}** moedas para **${recipient.username}**.`)
            .addFields(
                { name: 'Seu saldo atual', value: `${senderUser.balance} moedas`, inline: true },
                { name: 'Ação', value: 'Digite **confirmar** para concluir ou **cancelar** para desistir.', inline: false }
            )
            .setFooter({ text: 'AniBattle' });

        const confirmationMessage = await interaction.reply({
            embeds: [embed],
            fetchReply: true
        });

        giveCollect(interaction, senderId, amount, senderUser, recipientUser);
    } catch (err) {
        console.error('Erro ao executar o comando give:', err);
        const embed = new EmbedBuilder()
            .setTitle('❌ Erro')
            .setDescription('Houve um erro ao executar o comando give.')
            .setColor('#E53935');
        interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = { giveRun };
