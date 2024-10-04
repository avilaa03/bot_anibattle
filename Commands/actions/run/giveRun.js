const User = require('../../utils/userSchema');
const { giveCollect } = require('../collect/giveCollect.js');

async function giveRun(client, interaction) {
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

        giveCollect(interaction, senderId, amount, senderUser, recipientUser);

    } catch (err) {
        console.error('Erro ao executar o comando give:', err);
        interaction.reply({ content: 'Houve um erro ao executar o comando give.' });
    }
}

module.exports = { giveRun };
