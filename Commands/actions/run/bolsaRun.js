const { MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const bolsa = require('../../utils/bolsa');
const itens = require('../../utils/itens');

/**
 * /bolsa — o que o jogador tem de item.
 *
 * Fica separada do `/inventory` de propósito: aquele é de cartas, que são
 * coleção; esta é de material, que é consumo. Misturar os dois faria a
 * lista de cartas raras competir com "3 gemas" pelo mesmo espaço.
 */
module.exports = async (client, interaction) => {
    const user = await User.findOne({ id: interaction.user.id }).lean();
    const linhas = bolsa.listar(user);

    if (linhas.length === 0) {
        const embed = ui.info('🎒 Sua bolsa está vazia', [
            'Itens aparecem aqui quando você compra na `/loja` ou desmancha uma carta.',
            '',
            `💎 **${itens.getItem('gema').nome}** é o material do \`/aprimorar\`, e sai dos dois caminhos:`,
            `• \`/loja\` — ${ui.coins(itens.PRECO_GEMA)} cada`,
            '• `/desmanchar` — a carta vira gema em vez de moeda'
        ].join('\n'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const embed = ui.base()
        .setAuthor({ name: `Bolsa de ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
        .setTitle('🎒 Seus itens')
        .setDescription(
            linhas
                .map(({ item, quantidade }) => `${item.emoji} **${item.nome}** — ${ui.number(quantidade)}\n> ${item.descricao}`)
                .join('\n\n')
        );

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
};
