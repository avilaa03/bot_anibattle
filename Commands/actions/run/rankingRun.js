const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const elo = require('../../utils/elo');
const { badge } = require('../../utils/vip');
const { tDaInteracao } = require('../../utils/idioma');

/** /ranking — classificação por pontuação de batalha. */
async function rankingRun(client, interaction) {
    const t = await tDaInteracao(interaction);
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
            embeds: [ui.neutral(t('ranking.titulo_curto'), t('ranking.vazio'))]
        });
    }

    const lista = top.map((u, i) => {
        const div = elo.divisao(u.elo || elo.ELO_INICIAL, t.locale);
        const total = (u.wins || 0) + (u.losses || 0);
        const aproveitamento = total > 0 ? Math.round(((u.wins || 0) / total) * 100) : 0;
        const destaque = u.id === interaction.user.id;
        const nome = destaque ? `__<@${u.id}>__` : `<@${u.id}>`;
        const emblema = badge(u);

        return `${ui.medal(i)} ${emblema}${nome} ${div.emoji}\n`
            + `└ ${t('ranking.linha', {
                pontos: ui.number(u.elo || elo.ELO_INICIAL, t.locale),
                vitorias: u.wins || 0,
                derrotas: u.losses || 0,
                pct: aproveitamento
            })}`;
    }).join('\n');

    const embed = ui.base(ui.STATUS_COLORS.warning)
        .setTitle(t('ranking.titulo'))
        .setDescription(lista);

    // Posição do autor, se ele não estiver no top 10.
    const noTop = top.some((u) => u.id === interaction.user.id);
    if (!noTop) {
        const eu = await User.findOne({ id: interaction.user.id }).select('elo wins losses').lean();
        const totalPartidas = (eu?.wins || 0) + (eu?.losses || 0);

        if (eu && totalPartidas > 0) {
            const meuElo = eu.elo || elo.ELO_INICIAL;
            const acima = await User.countDocuments({ ...filtro, elo: { $gt: meuElo } });
            const div = elo.divisao(meuElo, t.locale);
            const proxima = elo.proximaDivisao(meuElo, t.locale);

            embed.addFields({
                name: t('comum.sua_posicao'),
                value: `\`#${acima + 1}\` ${div.emoji} **${div.nome}** — ${t('ranking.pontos', { n: ui.number(meuElo, t.locale) })}`
                    + (proxima
                        ? `\n└ ${t('ranking.faltam', { pts: proxima.faltam, emoji: proxima.emoji, divisao: proxima.nome })}`
                        : `\n└ ${t('ranking.divisao_maxima')}`),
                inline: false
            });
        } else {
            embed.addFields({
                name: t('comum.sua_posicao'),
                value: t('ranking.nunca_batalhou'),
                inline: false
            });
        }
    }

    embed.addFields({
        name: t('ranking.divisoes'),
        value: elo.DIVISOES
            .map((d) => `${d.emoji} ${elo.nomeDivisao(d.chave, t.locale)} ${d.min > 0 ? `(${d.min}+)` : ''}`)
            .join(' · '),
        inline: false
    });

    return interaction.editReply({ embeds: [embed] });
}

module.exports = rankingRun;
