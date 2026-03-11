const User = require("../../utils/userSchema");
const { EmbedBuilder } = require('discord.js');

async function dailyRun(client, interaction) {
    const userId = interaction.user.id;

    try {
        let user = await User.findOne({ id: userId });

        if (!user) {
            user = new User({
                id: userId,
                balance: 0,
                lastDaily: null
            });
        }

        const today = new Date();
        if (user.lastDaily && user.lastDaily.toDateString() === today.toDateString()) {
            const embed = new EmbedBuilder()
                .setTitle('📅 Recompensa diária')
                .setDescription('Você já coletou sua recompensa diária hoje. Volte amanhã!')
                .setColor('#9E9E9E')
                .setFooter({ text: 'AniBattle' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const dailyAmount = Math.floor(Math.random() * (100 - 10 + 1) + 10);
        user.balance += dailyAmount;
        user.lastDaily = today;
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle('💰 Recompensa diária coletada!')
            .setColor('#FFD700')
            .setDescription(`Você resgatou sua recompensa diária.`)
            .addFields(
                { name: 'Valor recebido', value: `**+${dailyAmount}** moedas`, inline: true },
                { name: 'Saldo atual', value: `**${user.balance}** moedas`, inline: true }
            )
            .setFooter({ text: 'Volte amanhã para coletar novamente • AniBattle' })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao processar a recompensa diária:', err);
        const embed = new EmbedBuilder()
            .setTitle('❌ Erro')
            .setDescription('Houve um erro ao processar sua recompensa diária.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = dailyRun;