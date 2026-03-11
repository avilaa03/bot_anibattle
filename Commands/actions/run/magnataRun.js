const User = require('../../utils/userSchema');
const { EmbedBuilder } = require('discord.js');

async function magnataRun(client, interaction) {
    try {
        await interaction.deferReply();

        const users = await User.find({})
            .sort({ balance: -1 })
            .limit(10)
            .lean();

        const embed = new EmbedBuilder()
            .setTitle('💰 Magnatas do AniBattle')
            .setColor('#FFD700')
            .setDescription('Top 10 jogadores mais ricos do bot (por saldo em moedas).');

        if (!users || users.length === 0) {
            embed.addFields({ name: '\u200b', value: 'Nenhum jogador com saldo registrado ainda.' });
            return interaction.editReply({ embeds: [embed] });
        }

        const list = users.map((u, i) => {
            const pos = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
            const balance = u.balance ?? 0;
            return `${pos} <@${u.id}> — **${balance}** moedas`;
        }).join('\n');

        embed.addFields({ name: '\u200b', value: list });

        return interaction.editReply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao buscar magnatas:', err);
        const embed = new EmbedBuilder().setTitle('❌ Erro').setDescription('Houve um erro ao buscar o ranking.').setColor('#E53935');
        try {
            if (interaction.deferred) await interaction.editReply({ embeds: [embed] });
            else await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (e) {}
    }
}

module.exports = magnataRun;
