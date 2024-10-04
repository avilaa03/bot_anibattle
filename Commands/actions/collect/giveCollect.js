const { giveEnd } = require('../end/giveEnd.js');

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
            senderUser.balance -= amount;
            recipientUser.balance += amount;

            await senderUser.save();
            await recipientUser.save();

            interaction.followUp({ content: `Você deu ${amount} moedas para o usuário ${recipientUser.username}!` });
        } else {
            interaction.followUp({ content: 'Operação cancelada.' });
        }

        collector.stop('collected');
    });

    collector.on('end', collected => giveEnd(interaction, collected));
}

module.exports = { giveCollect };
