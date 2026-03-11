const User = require('../../utils/userSchema');
const { EmbedBuilder } = require('discord.js');

async function rankingRun(client, interaction) {
    const type = interaction.options.getString('tipo') || 'battles';

    try {
        const sortField = type === 'coins' ? 'balance' : 'wins';
        const users = await User.find({})
            .sort({ [sortField]: -1 })
            .limit(10)
            .lean();

        const title = type === 'coins'
            ? '🏆 Ranking de Moedas'
            : '⚔️ Ranking de Batalhas (vitórias)';

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor('#FFD700')
            .setDescription(type === 'coins'
                ? 'Top 10 jogadores com mais moedas.'
                : 'Top 10 jogadores com mais vitórias em batalhas.');

        if (!users || users.length === 0) {
            embed.addFields({ name: '\u200b', value: 'Nenhum dado ainda.' });
            return interaction.reply({ embeds: [embed] });
        }

        const list = users.map((u, i) => {
            const pos = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
            const value = type === 'coins' ? (u.balance ?? 0) : (u.wins ?? 0);
            return `${pos} <@${u.id}> — **${value}** ${type === 'coins' ? 'moedas' : 'vitórias'}`;
        }).join('\n');

        embed.addFields({ name: '\u200b', value: list });

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao buscar ranking:', err);
        return interaction.reply({ content: 'Houve um erro ao buscar o ranking.', ephemeral: true });
    }
}

module.exports = rankingRun;
