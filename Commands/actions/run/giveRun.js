const User = require('../../utils/userSchema');
const { giveCollect } = require('../collect/giveCollect.js');
const ui = require('../../utils/embeds');

async function giveRun(client, interaction) {
    const amount = interaction.options.getNumber('amount');
    const recipient = interaction.options.getUser('user');
    const senderId = interaction.user.id;

    try {
        if (recipient.id === senderId) {
            return interaction.reply({ embeds: [ui.error('Destinatário inválido', 'Você não pode transferir moedas para si mesmo.')], ephemeral: true });
        }
        if (recipient.bot) {
            return interaction.reply({ embeds: [ui.error('Destinatário inválido', 'Bots não recebem moedas.')], ephemeral: true });
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return interaction.reply({ embeds: [ui.error('Valor inválido', 'Informe uma quantia maior que zero.')], ephemeral: true });
        }

        const senderUser = await User.findOne({ id: senderId });
        if (!senderUser || senderUser.balance < amount) {
            const embed = ui.error('Saldo insuficiente', `Você tem ${ui.coins(senderUser?.balance || 0)} e precisa de ${ui.coins(amount)}.`);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        let recipientUser = await User.findOne({ id: recipient.id });
        if (!recipientUser) {
            recipientUser = new User({ id: recipient.id, balance: 0 });
        }

        const embed = ui.warning('Confirmar transferência', `Você vai enviar ${ui.coins(amount)} para **${recipient.username}**.`)
            .addFields(
                { name: 'Seu saldo agora', value: ui.coins(senderUser.balance), inline: true },
                { name: 'Depois da transferência', value: ui.coins(senderUser.balance - amount), inline: true },
                { name: 'Como confirmar', value: 'Digite `confirmar` no chat para concluir, ou `cancelar` para desistir.', inline: false }
            )
            .setFooter({ text: `${ui.BRAND} • Você tem 30 segundos` });

        await interaction.reply({ embeds: [embed], fetchReply: true });

        giveCollect(interaction, senderId, amount, senderUser, recipientUser);
    } catch (err) {
        console.error('Erro ao executar o comando give:', err);
        const embed = ui.error('Erro', 'Houve um erro ao executar a transferência.');
        interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
    }
}

module.exports = { giveRun };
