const { MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const bolsa = require('../../utils/bag');
const itens = require('../../utils/items');
const { tDaInteracao } = require('../../utils/language');

/**
 * /bolsa — o que o jogador tem de item.
 *
 * Fica separada do `/inventory` de propósito: aquele é de cartas, que são
 * coleção; esta é de material, que é consumo. Misturar os dois faria a
 * lista de cartas raras competir com "3 gemas" pelo mesmo espaço.
 */
module.exports = async (client, interaction) => {
    const t = await tDaInteracao(interaction);
    const user = await User.findOne({ id: interaction.user.id }).lean();
    const linhas = bolsa.listar(user, t.locale);

    if (linhas.length === 0) {
        const gema = itens.localizarPorChave('gema', t.locale);
        const embed = ui.info(t('bolsa.vazia_titulo'), [
            t('bolsa.vazia_texto'),
            '',
            t('bolsa.vazia_gema', { item: gema.nome }),
            t('bolsa.vazia_loja', { preco: ui.coins(itens.PRECO_GEMA, t.locale) }),
            t('bolsa.vazia_desmanchar')
        ].join('\n'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const embed = ui.base()
        .setAuthor({
            name: t('bolsa.autor', { jogador: interaction.user.username }),
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTitle(t('bolsa.titulo'))
        .setDescription(
            linhas
                .map(({ item, quantidade }) => (
                    `${item.emoji} **${item.nome}** — ${ui.number(quantidade, t.locale)}\n> ${item.descricao}`
                ))
                .join('\n\n')
        );

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
};
