const User = require('../../utils/userSchema');
const { EmbedBuilder } = require('discord.js');

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
            const embed = new EmbedBuilder()
                .setTitle('💰 Saldo')
                .setDescription(`O usuário <@${userId}> não foi encontrado ou não possui saldo registrado.`)
                .setColor('#9E9E9E');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('💰 Saldo')
            .setColor('#FFD700')
            .setDescription(`Saldo de <@${userId}>`)
            .addFields({ name: 'Moedas', value: `**${user.balance}**`, inline: true })
            .setFooter({ text: 'AniBattle' });
        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao buscar o saldo do usuário:', err);
        const embed = new EmbedBuilder()
            .setTitle('❌ Erro')
            .setDescription('Houve um erro ao buscar o saldo do usuário.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = balanceRun;