const User = require('../../utils/userSchema');
const Card = require('../../utils/cardSchema');
const ui = require('../../utils/embeds');
const { tDaInteracao } = require('../../utils/language');

async function colecionadoresRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    await interaction.deferReply();

    const totalCatalogo = await Card.countDocuments();

    // Ranking por quantidade de cartas distintas descobertas.
    const ranking = await User.aggregate([
        { $project: { id: 1, descobertas: { $size: { $ifNull: ['$discovered', []] } } } },
        { $match: { descobertas: { $gt: 0 } } },
        { $sort: { descobertas: -1 } },
        { $limit: 10 }
    ]);

    if (ranking.length === 0) {
        const embed = ui.neutral(t('colecionadores.titulo_curto'), t('colecionadores.vazio'));
        return interaction.editReply({ embeds: [embed] });
    }

    const lista = ranking.map((u, i) => {
        const pct = totalCatalogo > 0 ? (u.descobertas / totalCatalogo) * 100 : 0;
        const destaque = u.id === interaction.user.id;
        const nome = destaque ? `__<@${u.id}>__` : `<@${u.id}>`;
        return `${ui.medal(i)} ${nome}\n└ ${t('colecionadores.linha', {
            atual: ui.number(u.descobertas, t.locale),
            total: ui.number(totalCatalogo, t.locale),
            pct: pct.toFixed(1)
        })}`;
    }).join('\n');

    const embed = ui.base(ui.STATUS_COLORS.info)
        .setTitle(t('colecionadores.titulo'))
        .setDescription(lista)
        .setFooter({ text: `${ui.BRAND} • ${t('colecionadores.rodape', { n: ui.number(totalCatalogo, t.locale) })}` });

    // Se o autor não está no top 10, mostra a posição dele mesmo assim.
    const noTop = ranking.some((u) => u.id === interaction.user.id);
    if (!noTop) {
        const eu = await User.findOne({ id: interaction.user.id }).select('discovered').lean();
        const minhas = eu?.discovered?.length || 0;
        if (minhas > 0) {
            const acima = await User.countDocuments({
                $expr: { $gt: [{ $size: { $ifNull: ['$discovered', []] } }, minhas] }
            });
            const pct = totalCatalogo > 0 ? (minhas / totalCatalogo) * 100 : 0;
            embed.addFields({
                name: t('comum.sua_posicao'),
                value: `\`#${acima + 1}\` — ${t('colecionadores.linha', {
                    atual: ui.number(minhas, t.locale),
                    total: ui.number(totalCatalogo, t.locale),
                    pct: pct.toFixed(1)
                })}`,
                inline: false
            });
        }
    }

    return interaction.editReply({ embeds: [embed] });
}

module.exports = colecionadoresRun;
