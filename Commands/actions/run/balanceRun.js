const User = require('../../utils/userSchema');

async function balanceRun(client, interaction) {
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

module.exports = balanceRun;