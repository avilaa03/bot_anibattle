const { giveEnd } = require('../end/giveEnd.js');
const { trySpend, addBalance } = require('../../utils/economy.js');
const ui = require('../../utils/embeds.js');

function giveCollect(interaction, senderId, amount, senderUser, recipientUser) {
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
            // Débito atômico: só efetiva se o saldo ainda for suficiente no
            // instante da confirmação (evita duplicar/perder moedas se o
            // usuário fizer outra ação com o saldo entre o /give e a
            // confirmação por mensagem).
            const updatedSender = await trySpend(senderId, amount);
            if (!updatedSender) {
                interaction.followUp({
                    embeds: [ui.error('Saldo insuficiente', 'Seu saldo mudou e não dá mais para completar essa transferência.')]
                }).catch(() => {});
            } else {
                const destino = await addBalance(recipientUser.id, amount);
                const embed = ui.success('Transferência concluída', `${ui.coins(amount)} enviadas para <@${recipientUser.id}>.`)
                    .addFields(
                        { name: 'Seu saldo', value: ui.coins(updatedSender.balance), inline: true },
                        { name: 'Saldo do destinatário', value: ui.coins(destino?.balance ?? 0), inline: true }
                    );
                interaction.followUp({ embeds: [embed] }).catch(() => {});
            }
        } else {
            interaction.followUp({
                embeds: [ui.neutral('Transferência cancelada', 'Nenhuma moeda foi movida.')]
            }).catch(() => {});
        }

        collector.stop('collected');
    });

    collector.on('end', collected => giveEnd(interaction, collected));
}

module.exports = { giveCollect };
