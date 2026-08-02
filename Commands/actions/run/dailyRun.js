const User = require("../../utils/userSchema");
const ui = require('../../utils/embeds');
const { getPerks } = require('../../utils/vip');

const DAILY_MIN = 10;
const DAILY_MAX = 100;

async function dailyRun(client, interaction) {
    const userId = interaction.user.id;

    try {
        let user = await User.findOne({ id: userId });

        if (!user) {
            user = new User({ id: userId, balance: 0, lastDaily: null });
        }

        const today = new Date();
        if (user.lastDaily && user.lastDaily.toDateString() === today.toDateString()) {
            // Meia-noite do dia seguinte, no fuso do servidor.
            const amanha = new Date(today);
            amanha.setDate(amanha.getDate() + 1);
            amanha.setHours(0, 0, 0, 0);

            const embed = ui.warning('Recompensa já coletada', `Você já pegou sua recompensa de hoje.\nA próxima libera <t:${Math.floor(amanha.getTime() / 1000)}:R>.`)
                .addFields({ name: 'Saldo atual', value: ui.coins(user.balance || 0), inline: true });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const perks = getPerks(user);
        const base = Math.floor(Math.random() * (DAILY_MAX - DAILY_MIN + 1) + DAILY_MIN);
        const dailyAmount = Math.floor(base * perks.dailyMultiplier);

        user.balance = (user.balance || 0) + dailyAmount;
        user.lastDaily = today;
        await user.save();

        const embed = ui.success('Recompensa diária coletada', `Você recebeu ${ui.coins(dailyAmount)}.`)
            .addFields(
                { name: 'Recebido', value: ui.coins(dailyAmount), inline: true },
                { name: 'Saldo atual', value: ui.coins(user.balance), inline: true }
            );

        if (perks.vip) {
            embed.addFields({ name: 'Bônus VIP', value: `${perks.tier.emoji} **${perks.tier.nome}** — ${perks.dailyMultiplier}x (base era ${ui.coins(base)})`, inline: false });
            embed.setFooter({ text: `${ui.BRAND} • Volte amanhã para coletar de novo` });
        } else {
            embed.setFooter({ text: `${ui.BRAND} • Assinantes recebem até 3x — veja /vip` });
        }

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao processar a recompensa diária:', err);
        const embed = ui.error('Erro', 'Houve um erro ao processar sua recompensa diária.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = dailyRun;
