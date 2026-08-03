const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const trade = require('../utils/trade');
const { registrar } = require('../utils/progresso');
const { anunciarConquistas } = require('../utils/notificacoes');
const { montarEmbed, montarComponentes } = require('../actions/run/trocarRun');
const { MessageFlags } = require('discord.js');

/**
 * Botões e menus da mesa de troca.
 *
 * Ficam num handler global (e não num coletor) porque a mesa pode durar
 * bem mais que o comando que a criou, e porque um restart do bot não pode
 * deixar a negociação travada sem resposta.
 *
 * customIds:
 *   trade_pick_<id>_<lado>
 *   trade_confirm_<id>
 *   trade_cancel_<id>
 */

async function carregarInventarios(t) {
    const [docP, docA] = await Promise.all([
        User.findOne({ id: t.proponente.id }).select('inventory').lean(),
        User.findOne({ id: t.alvo.id }).select('inventory').lean()
    ]);
    return {
        proponente: docP?.inventory || [],
        alvo: docA?.inventory || []
    };
}

async function handleTrade(client, interaction) {
    const id = interaction.customId;
    if (!id.startsWith('trade_')) return false;

    // O convite (accept/decline) é tratado pelo coletor do próprio comando.
    if (id.startsWith('trade_accept_') || id.startsWith('trade_decline_')) return false;

    const partes = id.split('_');
    const acao = partes[1];
    const tradeId = partes[2];

    const t = await trade.buscar(tradeId);
    if (!t) {
        await interaction.reply({
            embeds: [ui.error('Troca expirada', 'Essa negociação não existe mais.')],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    const lado = trade.ladoDe(t, interaction.user.id);
    if (!lado) {
        await interaction.reply({
            embeds: [ui.error('Negociação alheia', 'Você não faz parte desta troca.')],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // ---- Cancelar ----
    if (acao === 'cancel') {
        await trade.apagar(tradeId);
        await interaction.update({
            content: null,
            embeds: [ui.neutral('Troca cancelada', `**${interaction.user.username}** cancelou a negociação. Nenhuma carta mudou de dono.`)],
            components: []
        }).catch(() => {});
        return true;
    }

    // ---- Escolher cartas ----
    if (acao === 'pick') {
        const ladoDoMenu = partes[3];
        if (ladoDoMenu !== lado) {
            await interaction.reply({
                embeds: [ui.error('Menu do oponente', 'Use o menu com o seu nome.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        const inventarios = await carregarInventarios(t);
        const meuInventario = inventarios[lado];
        const escolhidos = new Set(interaction.values || []);

        // O menu manda a seleção completa, então reconstruímos a oferta a
        // partir dela em vez de alternar item por item.
        const novasCartas = meuInventario
            .filter((c) => escolhidos.has(String(c._id)))
            .slice(0, trade.MAX_CARTAS)
            .map((c) => ({
                inventoryId: c._id,
                originalCardId: c.originalCardId,
                name: c.name,
                series: c.series,
                rarity: c.rarity,
                overall: c.overall,
                marketValue: c.marketValue
            }));

        t[lado].cartas = novasCartas;
        // Mexeu na oferta, as duas confirmações caem.
        t.proponente.confirmou = false;
        t.alvo.confirmou = false;
        t.fase = 'montando';
        await t.save();

        await interaction.update({
            embeds: [montarEmbed(t)],
            components: montarComponentes(t, inventarios)
        }).catch(() => {});
        return true;
    }

    // ---- Confirmar ----
    if (acao === 'confirm') {
        if (t.proponente.cartas.length === 0 && t.alvo.cartas.length === 0) {
            await interaction.reply({
                embeds: [ui.warning('Oferta vazia', 'Pelo menos um dos lados precisa oferecer alguma carta.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        const atualizada = await trade.confirmar(tradeId, interaction.user.id);
        if (!atualizada) return true;

        if (!trade.ambosConfirmaram(atualizada)) {
            const inventarios = await carregarInventarios(atualizada);
            await interaction.update({
                embeds: [montarEmbed(atualizada)],
                components: montarComponentes(atualizada, inventarios)
            }).catch(() => {});
            return true;
        }

        // Os dois confirmaram: executa.
        await interaction.deferUpdate().catch(() => {});
        const resultado = await trade.executar(tradeId);

        if (!resultado.ok) {
            if (resultado.motivo === 'JA_EXECUTANDO') return true;

            const embed = ui.error(
                'Troca cancelada',
                resultado.motivo === 'POSSE'
                    ? `Cartas que não estão mais no inventário: ${resultado.faltando.join(', ')}.\n\nNinguém perdeu nada.`
                    : 'Não foi possível concluir a troca. Nenhuma carta mudou de dono.'
            );
            await interaction.editReply({ content: null, embeds: [embed], components: [] }).catch(() => {});
            await trade.apagar(tradeId);
            return true;
        }

        const t2 = resultado.trade;
        const resumo = (cartas) => cartas.length > 0
            ? cartas.map((c) => `${ui.getRarity(c.rarity).emoji} **${ui.cardName(c.name)}**`).join('\n')
            : '*(nada)*';

        const sucesso = ui.success('Troca concluída!', 'As cartas trocaram de dono.')
            .addFields(
                { name: `${t2.alvo.username} recebeu`, value: resumo(t2.proponente.cartas), inline: true },
                { name: `${t2.proponente.username} recebeu`, value: resumo(t2.alvo.cartas), inline: true }
            );

        await interaction.editReply({ content: null, embeds: [sucesso], components: [] }).catch(() => {});

        // Contadores, missões e conquistas dos dois lados.
        const resultados = await Promise.all([
            registrar(t2.proponente.id, { trocasFeitas: 1 }, { eventosMissao: ['troca'] }),
            registrar(t2.alvo.id, { trocasFeitas: 1 }, { eventosMissao: ['troca'] })
        ]).catch(() => []);

        for (let i = 0; i < resultados.length; i++) {
            const conquistas = resultados[i]?.conquistas || [];
            if (conquistas.length === 0) continue;
            const userId = i === 0 ? t2.proponente.id : t2.alvo.id;
            await anunciarConquistas(client, userId, conquistas, interaction.channel);
        }

        await trade.apagar(tradeId);
        return true;
    }

    return false;
}

module.exports = { handleTrade };
