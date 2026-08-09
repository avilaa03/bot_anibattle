const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { MessageFlags } = require('discord.js');
const { tDaInteracao } = require('../../utils/idioma');

async function balanceRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const alvo = interaction.options.getUser('user') || interaction.user;

    try {
        const user = await User.findOne({ id: alvo.id });

        if (!user) {
            // A frase muda conforme o alvo é você ou outra pessoa. Em vez
            // de montar meia frase no código, cada caso é uma chave — nem
            // todo idioma corta a frase no mesmo lugar.
            const embed = ui.neutral(
                t('balance.titulo_curto'),
                alvo.id === interaction.user.id
                    ? t('balance.sem_perfil_voce')
                    : t('balance.sem_perfil_outro', { jogador: alvo.username })
            );
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const inventoryValue = (user.inventory || []).reduce((sum, c) => sum + (c.marketValue || 0), 0);

        const embed = ui.base(ui.STATUS_COLORS.warning)
            .setAuthor({ name: alvo.username, iconURL: alvo.displayAvatarURL() })
            .setTitle(t('balance.titulo'))
            .addFields(
                { name: t('balance.em_moedas'), value: ui.coins(user.balance || 0, t.locale), inline: true },
                { name: t('balance.em_cartas'), value: ui.coins(inventoryValue, t.locale), inline: true },
                { name: t('balance.patrimonio'), value: ui.coins((user.balance || 0) + inventoryValue, t.locale), inline: true }
            );

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao buscar o saldo do usuário:', err);
        const embed = ui.error(t('comum.erro'), t('balance.erro'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}

module.exports = balanceRun;
