const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { MessageFlags } = require('discord.js');
const { tDaInteracao } = require('../../utils/language');

async function magnataRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    try {
        await interaction.deferReply();

        const users = await User.find({ balance: { $gt: 0 } })
            .sort({ balance: -1 })
            .limit(10)
            .lean();

        if (!users || users.length === 0) {
            const embed = ui.neutral(t('magnata.titulo_curto'), t('magnata.vazio'));
            return interaction.editReply({ embeds: [embed] });
        }

        const posicaoDoAutor = await User.countDocuments({ balance: { $gt: 0 } }).then(async () => {
            const eu = await User.findOne({ id: interaction.user.id }).lean();
            if (!eu) return null;
            const acima = await User.countDocuments({ balance: { $gt: eu.balance || 0 } });
            return { posicao: acima + 1, balance: eu.balance || 0 };
        });

        const lista = users.map((u, i) => {
            const destaque = u.id === interaction.user.id;
            const nome = destaque ? `__<@${u.id}>__` : `<@${u.id}>`;
            return `${ui.medal(i)} ${nome}\n└ ${ui.coins(u.balance || 0, t.locale)}`;
        }).join('\n');

        const embed = ui.base(ui.STATUS_COLORS.warning)
            .setTitle(t('magnata.titulo'))
            .setDescription(lista);

        if (posicaoDoAutor && posicaoDoAutor.posicao > 10) {
            embed.addFields({
                name: t('comum.sua_posicao'),
                value: `\`#${posicaoDoAutor.posicao}\` — ${ui.coins(posicaoDoAutor.balance, t.locale)}`,
                inline: false
            });
        }

        return interaction.editReply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao buscar magnatas:', err);
        const embed = ui.error(t('comum.erro'), t('magnata.erro'));
        try {
            if (interaction.deferred) await interaction.editReply({ embeds: [embed] });
            else await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } catch (e) { /* ignora */ }
    }
}

module.exports = magnataRun;
