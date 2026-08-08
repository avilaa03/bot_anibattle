const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { formatarNumero } = require('../../utils/dexNumbers');
const wishlist = require('../../utils/wishlist');
const { tDaInteracao } = require('../../utils/idioma');

/** /desejos — mostra a lista de desejos do jogador. */
async function desejosRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const alvo = interaction.options.getUser('user') || interaction.user;
    const ehProprio = alvo.id === interaction.user.id;

    await interaction.deferReply();

    const user = await User.findOne({ id: alvo.id }).lean();
    const desejos = user?.wishlist || [];

    if (desejos.length === 0) {
        return interaction.editReply({
            embeds: [ui.neutral(
                t('desejos.vazia'),
                ehProprio
                    ? t('desejos.vazia_propria')
                    : t('desejos.vazia_outro', { jogador: alvo.username })
            )]
        });
    }

    const [cartas, totalCatalogo] = await Promise.all([
        Card.find({ _id: { $in: desejos.map((d) => d.cardId) } })
            .select('numero name series rarity overall')
            .lean(),
        Card.countDocuments()
    ]);

    // Ordena da mais rara para a mais comum — é a ordem que interessa.
    cartas.sort((a, b) => {
        const porRaridade = ui.compareRarityDesc(a.rarity, b.rarity);
        return porRaridade !== 0 ? porRaridade : (a.numero || 0) - (b.numero || 0);
    });

    const descobertas = new Set((user?.discovered || []).map((d) => String(d.cardId)));
    const inventario = new Set((user?.inventory || []).map((c) => String(c.originalCardId)));

    // Quantos jogadores também procuram cada uma. Não é concorrência: a
    // carta rolada fica com quem rolou. O número serve para o jogador
    // saber se a carta é disputada NO MERCADO — ou seja, quanto ela
    // provavelmente vale numa troca.
    const contagens = await Promise.all(cartas.map((c) => wishlist.contarDesejos(c._id)));

    const linhas = cartas.map((carta, i) => {
        const meta = ui.getRarity(carta.rarity, t.locale);
        const temAgora = inventario.has(String(carta._id));
        const jaTeve = descobertas.has(String(carta._id));

        const marca = temAgora ? ' 🎴' : jaTeve ? ' 📖' : '';
        const procura = contagens[i] > 1 ? ` • ${t('desejos.tambem_procuram', { n: contagens[i] })}` : '';

        return `${formatarNumero(carta.numero, totalCatalogo)} ${meta.emoji} **${ui.cardName(carta.name, t.locale)}**${marca}\n`
            + `└ *${carta.series}* • ${t('atributos.ovr')} ${carta.overall}${procura}`;
    }).join('\n');

    const limite = wishlist.limiteDe(user);

    const embed = ui.base(ui.STATUS_COLORS.info)
        .setAuthor({ name: t('desejos.autor', { jogador: alvo.username }), iconURL: alvo.displayAvatarURL() })
        .setTitle(t('desejos.titulo'))
        .setDescription(linhas)
        .setFooter({
            text: `${ui.BRAND} • ${desejos.length}/${limite} • ${t('desejos.legenda')}`
        });

    return interaction.editReply({ embeds: [embed] });
}

module.exports = desejosRun;
