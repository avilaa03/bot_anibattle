const User = require('../../utils/userSchema');
const { EmbedBuilder } = require('discord.js');

async function magnataRun(client, interaction) {
    try {
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
            return interaction.reply({ embeds: [embed] });
        }

        const list = users.map((u, i) => {
            const pos = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
            const balance = u.balance ?? 0;
            return `${pos} <@${u.id}> — **${balance}** moedas`;
        }).join('\n');

        embed.addFields({ name: '\u200b', value: list });

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao buscar magnatas:', err);
        return interaction.reply({ content: 'Houve um erro ao buscar o ranking.', ephemeral: true });
    }
}

module.exports = magnataRun;
