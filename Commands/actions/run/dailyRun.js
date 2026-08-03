const User = require("../../utils/userSchema");
const ui = require('../../utils/embeds');
const { getPerks } = require('../../utils/vip');
const { registrar } = require('../../utils/progresso');
const { chaveDoDia } = require('../../utils/missoes');
const { MessageFlags } = require('discord.js');

/**
 * Recompensa diária com sequência (streak).
 *
 * O daily antigo dava de 10 a 100 moedas — cerca de 0,2% do que rolar
 * cartas rende no mesmo dia. Ninguém tinha motivo para usar.
 *
 * Agora ele cresce com a sequência e tem marcos: o valor de um único dia
 * continua modesto, mas manter a sequência vale muito. O objetivo não é
 * dar dinheiro, é criar o hábito de abrir o bot todo dia — e a sequência
 * dá algo que dinheiro não compra: a chatice de perder 20 dias de
 * progresso se você faltar um.
 */

const BASE = 200;
const BONUS_POR_DIA = 100;
const TETO_BONUS = 30;      // a partir do dia 30 o bônus para de crescer

// Marcos: dias em que a recompensa é multiplicada.
const MARCOS = {
    7: { multiplicador: 3, nome: 'Uma semana!' },
    14: { multiplicador: 4, nome: 'Duas semanas!' },
    30: { multiplicador: 6, nome: 'Um mês inteiro!' },
    60: { multiplicador: 8, nome: 'Dois meses!' },
    100: { multiplicador: 12, nome: 'Cem dias!' }
};

/** Recompensa base do dia N da sequência, antes do VIP. */
function calcularRecompensa(diaDaSequencia) {
    const diasContados = Math.min(diaDaSequencia, TETO_BONUS);
    let valor = BASE + (diasContados - 1) * BONUS_POR_DIA;

    const marco = MARCOS[diaDaSequencia];
    if (marco) valor *= marco.multiplicador;

    return Math.floor(valor);
}

/** Próximo marco ainda não alcançado, para mostrar como meta. */
function proximoMarco(sequenciaAtual) {
    const dias = Object.keys(MARCOS).map(Number).sort((a, b) => a - b);
    const alvo = dias.find((d) => d > sequenciaAtual);
    return alvo ? { dia: alvo, ...MARCOS[alvo] } : null;
}

/** Ontem em 'AAAA-MM-DD'. */
function chaveDeOntem() {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    return chaveDoDia(ontem);
}

async function dailyRun(client, interaction) {
    const userId = interaction.user.id;

    try {
        let user = await User.findOne({ id: userId });
        if (!user) user = new User({ id: userId });

        const hoje = chaveDoDia();
        const ultimoDia = user.streak?.ultimoDia || null;

        if (ultimoDia === hoje) {
            const amanha = new Date();
            amanha.setDate(amanha.getDate() + 1);
            amanha.setHours(0, 0, 0, 0);

            const embed = ui.warning(
                'Recompensa já coletada',
                `Você já pegou a de hoje. A próxima libera <t:${Math.floor(amanha.getTime() / 1000)}:R>.`
            ).addFields(
                { name: '🔥 Sequência atual', value: `**${user.streak?.atual || 0}** dia(s)`, inline: true },
                { name: 'Saldo', value: ui.coins(user.balance || 0), inline: true }
            );

            const proximo = proximoMarco(user.streak?.atual || 0);
            if (proximo) {
                embed.addFields({
                    name: '🎯 Próximo marco',
                    value: `Dia **${proximo.dia}** — ${proximo.nome} (recompensa ${proximo.multiplicador}x)\nFaltam **${proximo.dia - (user.streak?.atual || 0)}** dia(s).`,
                    inline: false
                });
            }
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Sequência continua se o último resgate foi ontem; senão recomeça.
        const manteve = ultimoDia === chaveDeOntem();
        const sequenciaAnterior = user.streak?.atual || 0;
        const novaSequencia = manteve ? sequenciaAnterior + 1 : 1;

        const perks = getPerks(user);
        const base = calcularRecompensa(novaSequencia);
        const total = Math.floor(base * perks.dailyMultiplier);

        user.balance = (user.balance || 0) + total;
        user.lastDaily = new Date();
        user.streak = {
            atual: novaSequencia,
            maior: Math.max(user.streak?.maior || 0, novaSequencia),
            ultimoDia: hoje
        };
        user.stats = user.stats || {};
        user.stats.moedasGanhas = (user.stats.moedasGanhas || 0) + total;
        user.stats.diasAtivos = (user.stats.diasAtivos || 0) + 1;
        await user.save();

        const marco = MARCOS[novaSequencia];

        const embed = ui.base(marco ? 0xFFD700 : ui.STATUS_COLORS.success)
            .setTitle(marco ? `🎉 ${marco.nome}` : '✅ Recompensa diária coletada')
            .setDescription(
                manteve || novaSequencia === 1
                    ? `Você recebeu ${ui.coins(total)}.`
                    : `Você recebeu ${ui.coins(total)}.\n\n💔 Sua sequência de **${sequenciaAnterior}** dias foi perdida — você faltou um dia.`
            )
            .addFields(
                { name: '🔥 Sequência', value: `**${novaSequencia}** dia(s)`, inline: true },
                { name: '🏆 Seu recorde', value: `**${user.streak.maior}** dia(s)`, inline: true },
                { name: '💰 Saldo', value: ui.coins(user.balance), inline: true }
            );

        if (marco) {
            embed.addFields({ name: 'Bônus de marco', value: `Recompensa multiplicada por **${marco.multiplicador}x**!`, inline: false });
        }

        if (perks.vip) {
            embed.addFields({
                name: 'Bônus VIP',
                value: `${perks.tier.emoji} **${perks.tier.nome}** — ${perks.dailyMultiplier}x (base era ${ui.coins(base)})`,
                inline: false
            });
        }

        const proximo = proximoMarco(novaSequencia);
        if (proximo) {
            embed.setFooter({
                text: `${ui.BRAND} • Dia ${proximo.dia}: ${proximo.nome} (${proximo.multiplicador}x) — faltam ${proximo.dia - novaSequencia} dia(s)`
            });
        } else {
            embed.setFooter({ text: `${ui.BRAND} • Volte amanhã para manter a sequência` });
        }

        await interaction.reply({ embeds: [embed] });

        // Progresso: missões e conquistas de sequência.
        const resultado = await registrar(userId, {}, { eventosMissao: ['diario'] });
        await avisarProgresso(interaction, resultado);
    } catch (err) {
        console.error('Erro ao processar a recompensa diária:', err);
        const embed = ui.error('Erro', 'Houve um erro ao processar sua recompensa diária.');
        const responder = interaction.replied || interaction.deferred
            ? interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral })
            : interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        responder.catch(() => {});
    }
}

/** Avisa em mensagem separada quando desbloqueou troféu ou missão. */
async function avisarProgresso(interaction, resultado) {
    if (!resultado) return;
    const { notificarProgresso } = require('../../utils/notificacoes');
    await notificarProgresso(interaction, resultado);
}

module.exports = dailyRun;
module.exports.calcularRecompensa = calcularRecompensa;
module.exports.MARCOS = MARCOS;
