const User = require("../../utils/userSchema");
const ui = require('../../utils/embeds');
const { getPerks, nomeTier } = require('../../utils/vip');
const { tDaInteracao } = require('../../utils/language');
const { registrar } = require('../../utils/progress');
const { chaveDoDia } = require('../../utils/missions');
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

// Marcos: dias em que a recompensa é multiplicada. O nome comemorativo
// de cada um sai de `daily.marcos.<dia>` no dicionário.
const MARCOS = {
    7: { multiplicador: 3 },
    14: { multiplicador: 4 },
    30: { multiplicador: 6 },
    60: { multiplicador: 8 },
    100: { multiplicador: 12 }
};

/** Nome comemorativo do marco, no idioma do jogador. */
function nomeMarco(dia, t) {
    return t(`daily.marcos.${dia}`);
}

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
    const t = await tDaInteracao(interaction);

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
                t('daily.ja_coletada_titulo'),
                t('daily.ja_coletada_texto', { quando: Math.floor(amanha.getTime() / 1000) })
            ).addFields(
                { name: t('daily.sequencia_atual'), value: t('daily.dias', { n: user.streak?.atual || 0 }), inline: true },
                { name: t('daily.saldo'), value: ui.coins(user.balance || 0, t.locale), inline: true }
            );

            const proximo = proximoMarco(user.streak?.atual || 0);
            if (proximo) {
                embed.addFields({
                    name: t('daily.proximo_marco'),
                    value: t('daily.proximo_marco_texto', {
                        dia: proximo.dia,
                        nome: nomeMarco(proximo.dia, t),
                        multiplicador: proximo.multiplicador,
                        faltam: proximo.dia - (user.streak?.atual || 0)
                    }),
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
            .setTitle(marco ? `🎉 ${nomeMarco(novaSequencia, t)}` : t('daily.coletada_titulo'))
            .setDescription(
                manteve || novaSequencia === 1
                    ? t('daily.recebeu', { valor: ui.coins(total, t.locale) })
                    : t('daily.recebeu_sequencia_perdida', {
                        valor: ui.coins(total, t.locale),
                        dias: sequenciaAnterior
                    })
            )
            .addFields(
                { name: t('daily.sequencia'), value: t('daily.dias', { n: novaSequencia }), inline: true },
                { name: t('daily.recorde'), value: t('daily.dias', { n: user.streak.maior }), inline: true },
                { name: t('daily.saldo_emoji'), value: ui.coins(user.balance, t.locale), inline: true }
            );

        if (marco) {
            embed.addFields({
                name: t('daily.bonus_marco'),
                value: t('daily.bonus_marco_texto', { multiplicador: marco.multiplicador }),
                inline: false
            });
        }

        if (perks.vip) {
            embed.addFields({
                name: t('daily.bonus_vip'),
                value: `${perks.tier.emoji} ${t('daily.bonus_vip_texto', {
                    plano: nomeTier(perks.tier.key, t.locale),
                    multiplicador: perks.dailyMultiplier,
                    base: ui.coins(base, t.locale)
                })}`,
                inline: false
            });
        }

        const proximo = proximoMarco(novaSequencia);
        if (proximo) {
            embed.setFooter({
                text: `${ui.BRAND} • ${t('daily.rodape_proximo', {
                    dia: proximo.dia,
                    nome: nomeMarco(proximo.dia, t),
                    multiplicador: proximo.multiplicador,
                    faltam: proximo.dia - novaSequencia
                })}`
            });
        } else {
            embed.setFooter({ text: `${ui.BRAND} • ${t('daily.rodape_volte')}` });
        }

        await interaction.reply({ embeds: [embed] });

        // Progresso: missões e conquistas de sequência.
        const resultado = await registrar(userId, {}, { eventosMissao: ['diario'] });
        await avisarProgresso(interaction, resultado);
    } catch (err) {
        console.error('Erro ao processar a recompensa diária:', err);
        const embed = ui.error(t('comum.erro'), t('daily.erro'));
        const responder = interaction.replied || interaction.deferred
            ? interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral })
            : interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        responder.catch(() => {});
    }
}

/** Avisa em mensagem separada quando desbloqueou troféu ou missão. */
async function avisarProgresso(interaction, resultado) {
    if (!resultado) return;
    const { notificarProgresso } = require('../../utils/notifications');
    await notificarProgresso(interaction, resultado);
}

module.exports = dailyRun;
module.exports.calcularRecompensa = calcularRecompensa;
module.exports.MARCOS = MARCOS;
