const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const elo = require('../../utils/elo');
const { badge } = require('../../utils/vip');

/** /ranking — classificação por pontuação de batalha. */
async function rankingRun(client, interaction) {
    await interaction.deferReply();

    // Só entra no ranking quem já batalhou — evita a lista ficar cheia
    // de gente com 1000 pontos que nunca duelou.
    const filtro = { $expr: { $gt: [{ $add: ['$wins', '$losses'] }, 0] } };

    const top = await User.find(filtro)
        .sort({ elo: -1, wins: -1 })
        .limit(10)
        .select('id elo wins losses vip')
        .lean();

    if (top.length === 0) {
        return interaction.editReply({
            embeds: [ui.neutral('⚔️ Ranking', 'Ninguém batalhou ainda. Use `/battle` para inaugurar a arena!')]
        });
    }

    const lista = top.map((u, i) => {
        const div = elo.divisao(u.elo || elo.ELO_INICIAL);
        const total = (u.wins || 0) + (u.losses || 0);
        const aproveitamento = total > 0 ? Math.round(((u.wins || 0) / total) * 100) : 0;
        const destaque = u.id === interaction.user.id;
        const nome = destaque ? `__<@${u.id}>__` : `<@${u.id}>`;
        const emblema = badge(u);

        return `${ui.medal(i)} ${emblema}${nome} ${div.emoji}\n`
            + `└ **${ui.number(u.elo || elo.ELO_INICIAL)}** pts • ${u.wins || 0}V ${u.losses || 0}D (${aproveitamento}%)`;
    }).join('\n');

    const embed = ui.base(ui.STATUS_COLORS.warning)
        .setTitle('⚔️ Ranking de batalha')
        .setDescription(lista);

    // Posição do autor, se ele não estiver no top 10.
    const noTop = top.some((u) => u.id === interaction.user.id);
    if (!noTop) {
        const eu = await User.findOne({ id: interaction.user.id }).select('elo wins losses').lean();
        const totalPartidas = (eu?.wins || 0) + (eu?.losses || 0);

        if (eu && totalPartidas > 0) {
            const meuElo = eu.elo || elo.ELO_INICIAL;
            const acima = await User.countDocuments({ ...filtro, elo: { $gt: meuElo } });
            const div = elo.divisao(meuElo);
            const proxima = elo.proximaDivisao(meuElo);

            embed.addFields({
                name: 'Sua posição',
                value: `\`#${acima + 1}\` ${div.emoji} **${div.nome}** — ${ui.number(meuElo)} pts`
                    + (proxima ? `\n└ Faltam **${proxima.faltam}** pts para ${proxima.emoji} ${proxima.nome}` : '\n└ Você está na divisão mais alta!'),
                inline: false
            });
        } else {
            embed.addFields({
                name: 'Sua posição',
                value: 'Você ainda não batalhou. Use `/battle` para entrar no ranking.',
                inline: false
            });
        }
    }

    embed.addFields({
        name: 'Divisões',
        value: elo.DIVISOES.map((d) => `${d.emoji} ${d.nome} ${d.min > 0 ? `(${d.min}+)` : ''}`).join(' · '),
        inline: false
    });

    return interaction.editReply({ embeds: [embed] });
}

module.exports = rankingRun;
