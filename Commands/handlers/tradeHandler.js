const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const trade = require('../utils/trade');
const { registrar } = require('../utils/progresso');
const { anunciarConquistas } = require('../utils/notificacoes');
const { montarEmbed, montarComponentes } = require('../actions/run/trocarRun');
const { MessageFlags } = require('discord.js');
const { tDaInteracao, tDoUsuario } = require('../utils/idioma');

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
 *
 * ## Idioma
 *
 * A mesa é UMA mensagem que os dois jogadores enxergam, então ela sai no
 * idioma de quem clicou por último. É a escolha menos ruim: alternar o
 * idioma da mesa a cada clique incomoda menos do que fixar o idioma de um
 * dos lados e deixar o outro sem entender a própria negociação.
 *
 * `troca` é o documento da negociação; `t` é sempre o tradutor, como no
 * resto do bot.
 */

async function carregarInventarios(troca) {
    const [docP, docA] = await Promise.all([
        User.findOne({ id: troca.proponente.id }).select('inventory').lean(),
        User.findOne({ id: troca.alvo.id }).select('inventory').lean()
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

    const t = await tDaInteracao(interaction);

    const partes = id.split('_');
    const acao = partes[1];
    const tradeId = partes[2];

    const troca = await trade.buscar(tradeId);
    if (!troca) {
        await interaction.reply({
            embeds: [ui.error(t('trocar.expirada'), t('trocar.expirada_texto'))],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    const lado = trade.ladoDe(troca, interaction.user.id);
    if (!lado) {
        await interaction.reply({
            embeds: [ui.error(t('trocar.alheia'), t('trocar.alheia_texto'))],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // ---- Cancelar ----
    if (acao === 'cancel') {
        await trade.apagar(tradeId);
        await interaction.update({
            content: null,
            embeds: [ui.neutral(
                t('trocar.cancelada'),
                t('trocar.cancelada_texto', { jogador: interaction.user.username })
            )],
            components: []
        }).catch(() => {});
        return true;
    }

    // ---- Escolher cartas ----
    if (acao === 'pick') {
        const ladoDoMenu = partes[3];
        if (ladoDoMenu !== lado) {
            await interaction.reply({
                embeds: [ui.error(t('trocar.menu_do_oponente'), t('trocar.menu_do_oponente_texto'))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        const inventarios = await carregarInventarios(troca);
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

        troca[lado].cartas = novasCartas;
        // Mexeu na oferta, as duas confirmações caem.
        troca.proponente.confirmou = false;
        troca.alvo.confirmou = false;
        troca.fase = 'montando';
        await troca.save();

        await interaction.update({
            embeds: [montarEmbed(troca, t)],
            components: montarComponentes(troca, inventarios, t)
        }).catch(() => {});
        return true;
    }

    // ---- Confirmar ----
    if (acao === 'confirm') {
        if (troca.proponente.cartas.length === 0 && troca.alvo.cartas.length === 0) {
            await interaction.reply({
                embeds: [ui.warning(t('trocar.oferta_vazia'), t('trocar.oferta_vazia_texto'))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        const atualizada = await trade.confirmar(tradeId, interaction.user.id);
        if (!atualizada) return true;

        if (!trade.ambosConfirmaram(atualizada)) {
            const inventarios = await carregarInventarios(atualizada);
            await interaction.update({
                embeds: [montarEmbed(atualizada, t)],
                components: montarComponentes(atualizada, inventarios, t)
            }).catch(() => {});
            return true;
        }

        // Os dois confirmaram: executa.
        await interaction.deferUpdate().catch(() => {});
        const resultado = await trade.executar(tradeId);

        if (!resultado.ok) {
            if (resultado.motivo === 'JA_EXECUTANDO') return true;

            const embed = ui.error(
                t('trocar.cancelada'),
                resultado.motivo === 'POSSE'
                    ? t('trocar.falta_posse', { cartas: resultado.faltando.join(', ') })
                    : t('trocar.falhou')
            );
            await interaction.editReply({ content: null, embeds: [embed], components: [] }).catch(() => {});
            await trade.apagar(tradeId);
            return true;
        }

        const concluida = resultado.trade;
        const resumo = (cartas) => cartas.length > 0
            ? cartas.map((c) => `${ui.getRarity(c.rarity, t.locale).emoji} **${ui.cardName(c.name, t.locale)}**`).join('\n')
            : t('trocar.nada');

        const sucesso = ui.success(t('trocar.concluida'), t('trocar.concluida_texto'))
            .addFields(
                { name: t('trocar.recebeu', { jogador: concluida.alvo.username }), value: resumo(concluida.proponente.cartas), inline: true },
                { name: t('trocar.recebeu', { jogador: concluida.proponente.username }), value: resumo(concluida.alvo.cartas), inline: true }
            );

        await interaction.editReply({ content: null, embeds: [sucesso], components: [] }).catch(() => {});

        // Contadores, missões e conquistas dos dois lados.
        const resultados = await Promise.all([
            registrar(concluida.proponente.id, { trocasFeitas: 1 }, { eventosMissao: ['troca'] }),
            registrar(concluida.alvo.id, { trocasFeitas: 1 }, { eventosMissao: ['troca'] })
        ]).catch(() => []);

        for (let i = 0; i < resultados.length; i++) {
            const conquistas = resultados[i]?.conquistas || [];
            if (conquistas.length === 0) continue;
            const userId = i === 0 ? concluida.proponente.id : concluida.alvo.id;
            // O troféu é de quem conquistou, então sai no idioma dele —
            // não no de quem clicou em confirmar por último.
            const tDono = await tDoUsuario(userId, interaction.guildId);
            await anunciarConquistas(client, userId, conquistas, interaction.channel, tDono.locale);
        }

        await trade.apagar(tradeId);
        return true;
    }

    return false;
}

module.exports = { handleTrade };
