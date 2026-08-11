const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const trade = require('../utils/trade');
const { registrar } = require('../utils/progresso');
const { anunciarConquistas } = require('../utils/notificacoes');
const { montarEmbed, montarComponentes } = require('../actions/run/tradeRun');
const { MessageFlags } = require('discord.js');
const { podeCancelarTroca, mensagem } = require('../utils/cicloDeVida');
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
 * ## Duas vozes, e por quê
 *
 * `t` é o idioma de quem clicou, e vale para tudo que é resposta privada:
 * "essa troca não é sua", "oferta vazia". Só aquela pessoa lê.
 *
 * `tMesa` é o idioma do servidor, e vale para a mensagem da mesa e para o
 * desfecho dela. A mesa é editada por dois jogadores em turnos; no idioma
 * de quem clicou, ela viraria de português para inglês e de volta a cada
 * carta escolhida. Mesmo critério do quadro do torneio.
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

    const partes = id.split('_');
    const acao = partes[1];
    const tradeId = partes[2];

    const t = await tDaInteracao(interaction);
    const tMesa = await tDoUsuario(null, interaction.guildId);

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

    // ---- Aceitar / recusar o convite ----
    //
    // ## Por que isto saiu do coletor
    //
    // O convite era resolvido por um `createMessageComponentCollector` no
    // próprio `/trocar`. Dois problemas somados faziam o aceite responder
    // "o bot não respondeu a tempo":
    //
    // 1. **O coletor morre quando o bot reinicia.** Todo deploy derrubava
    //    os convites abertos, e clicar em Aceitar não encontrava ninguém
    //    escutando — a interação ficava sem resposta até o Discord
    //    desistir. Com deploy automático a cada merge, isso era frequente.
    //
    // 2. **Não havia `deferUpdate`.** O Discord dá 3 segundos para a
    //    primeira resposta, e o caminho fazia duas idas ao banco antes de
    //    responder. Com o Atlas lento, estourava.
    //
    // O handler global não morre com restart, e o `deferUpdate` abaixo
    // compra os 15 minutos de janela. É o mesmo desenho que o botão de
    // cancelar já usava.
    if (acao === 'accept' || acao === 'decline') {
        if (troca.alvo.id !== interaction.user.id) {
            await interaction.reply({
                embeds: [ui.error(t('trocar.convite_alheio'), t('trocar.convite_alheio_texto'))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        // ANTES de qualquer consulta: é isto que impede o estouro de 3s.
        await interaction.deferUpdate().catch(() => {});

        if (acao === 'decline') {
            await trade.apagar(tradeId);
            await interaction.editReply({
                content: null,
                embeds: [ui.neutral(
                    tMesa('trocar.recusada'),
                    tMesa('trocar.recusada_texto', { jogador: interaction.user.username })
                )],
                components: []
            }).catch(() => {});
            return true;
        }

        if (troca.fase !== 'aguardando') {
            await interaction.editReply({
                content: null,
                embeds: [ui.neutral(tMesa('trocar.ja_respondido'), tMesa('trocar.ja_respondido_texto'))],
                components: []
            }).catch(() => {});
            return true;
        }

        troca.fase = 'montando';
        await troca.save();

        const inventarios = await carregarInventarios(troca);
        await interaction.editReply({
            content: `<@${troca.proponente.id}> ⇄ <@${troca.alvo.id}>`,
            embeds: [montarEmbed(troca, tMesa)],
            components: montarComponentes(troca, inventarios, tMesa)
        }).catch(() => {});
        return true;
    }

    // ---- Cancelar ----
    if (acao === 'cancel') {
        // A regra fica em cicloDeVida.js, compartilhada com a batalha.
        // O ponto sensível é a fase 'executando': ali as cartas já estão
        // mudando de dono, e cancelar no meio deixaria o inventário dos
        // dois inconsistente.
        const permissao = podeCancelarTroca(troca, interaction.user.id);
        if (!permissao.ok) {
            await interaction.reply({
                embeds: [ui.error(t('trocar.nao_da_para_cancelar'), mensagem(permissao.motivo, t.locale))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        await trade.apagar(tradeId);
        await interaction.update({
            content: null,
            embeds: [ui.neutral(
                tMesa('trocar.cancelada'),
                tMesa('trocar.cancelada_texto', { jogador: interaction.user.username })
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
            embeds: [montarEmbed(troca, tMesa)],
            components: montarComponentes(troca, inventarios, tMesa)
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
                embeds: [montarEmbed(atualizada, tMesa)],
                components: montarComponentes(atualizada, inventarios, tMesa)
            }).catch(() => {});
            return true;
        }

        // Os dois confirmaram: executa.
        await interaction.deferUpdate().catch(() => {});
        const resultado = await trade.executar(tradeId);

        if (!resultado.ok) {
            if (resultado.motivo === 'JA_EXECUTANDO') return true;

            const embed = ui.error(
                tMesa('trocar.cancelada'),
                resultado.motivo === 'POSSE'
                    ? tMesa('trocar.falta_posse', { cartas: resultado.faltando.join(', ') })
                    : tMesa('trocar.falhou')
            );
            await interaction.editReply({ content: null, embeds: [embed], components: [] }).catch(() => {});
            await trade.apagar(tradeId);
            return true;
        }

        const finalizada = resultado.trade;
        const resumo = (cartas) => cartas.length > 0
            ? cartas.map((c) => `${ui.getRarity(c.rarity, tMesa.locale).emoji} **${ui.cardName(c)}**`).join('\n')
            : tMesa('trocar.nada');

        const sucesso = ui.success(tMesa('trocar.concluida'), tMesa('trocar.concluida_texto'))
            .addFields(
                {
                    name: tMesa('trocar.recebeu', { jogador: finalizada.alvo.username }),
                    value: resumo(finalizada.proponente.cartas),
                    inline: true
                },
                {
                    name: tMesa('trocar.recebeu', { jogador: finalizada.proponente.username }),
                    value: resumo(finalizada.alvo.cartas),
                    inline: true
                }
            );

        await interaction.editReply({ content: null, embeds: [sucesso], components: [] }).catch(() => {});

        // Contadores, missões e conquistas dos dois lados.
        const resultados = await Promise.all([
            registrar(finalizada.proponente.id, { trocasFeitas: 1 }, { eventosMissao: ['troca'] }),
            registrar(finalizada.alvo.id, { trocasFeitas: 1 }, { eventosMissao: ['troca'] })
        ]).catch(() => []);

        for (let i = 0; i < resultados.length; i++) {
            const conquistas = resultados[i]?.conquistas || [];
            if (conquistas.length === 0) continue;
            const userId = i === 0 ? finalizada.proponente.id : finalizada.alvo.id;
            await anunciarConquistas(client, userId, conquistas, interaction.channel);
        }

        await trade.apagar(tradeId);
        return true;
    }

    return false;
}

module.exports = { handleTrade };
