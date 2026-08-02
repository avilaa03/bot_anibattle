const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');

async function balanceRun(client, interaction) {
    const alvo = interaction.options.getUser('user') || interaction.user;

    try {
        const user = await User.findOne({ id: alvo.id });

        if (!user) {
            const embed = ui.neutral('🪙 Saldo', `${alvo.id === interaction.user.id ? 'Você ainda não tem' : `**${alvo.username}** ainda não tem`} um perfil. Use \`/daily\` ou \`/roll\` para começar.`);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const inventoryValue = (user.inventory || []).reduce((sum, c) => sum + (c.marketValue || 0), 0);

        const embed = ui.base(ui.STATUS_COLORS.warning)
            .setAuthor({ name: alvo.username, iconURL: alvo.displayAvatarURL() })
            .setTitle('🪙 Carteira')
            .addFields(
                { name: 'Em moedas', value: ui.coins(user.balance || 0), inline: true },
                { name: 'Em cartas', value: ui.coins(inventoryValue), inline: true },
                { name: 'Patrimônio total', value: ui.coins((user.balance || 0) + inventoryValue), inline: true }
            );

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao buscar o saldo do usuário:', err);
        const embed = ui.error('Erro', 'Houve um erro ao buscar o saldo.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = balanceRun;
