const { MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const Card = require('../../utils/cardSchema');
const ui = require('../../utils/embeds');
const caixas = require('../../utils/caixas');
const bolsa = require('../../utils/bolsa');
const valores = require('../../utils/valores');
const limiteDiario = require('../../utils/limiteDiario');
const transacoes = require('../../utils/transacoes');
const { trySpend, addBalance } = require('../../utils/economy');
const { renderCard } = require('../../utils/cardRenderer');
const { molduraEfetiva } = require('../../utils/vip');
const { registerDiscovery } = require('../../utils/discovery');
const { registrar } = require('../../utils/progresso');
const mongoose = require('mongoose');
const { tDaInteracao } = require('../../utils/idioma');

/**
 * /caixa — comprar e abrir caixas.
 *
 * ## Comprar e abrir são atos separados
 *
 * A caixa vai para a bolsa e o jogador abre quando quiser. Não é só
 * conveniência: é o que torna a Caixa do Apoiador possível. Ela não é
 * comprada, é dada por votar no bot — se comprar e abrir fossem o mesmo
 * ato, não existiria caminho para uma caixa que ninguém comprou.
 *
 * ## O limite é na COMPRA, não na abertura
 *
 * A restrição econômica está em converter moeda em carta. Uma vez que a
 * caixa é sua, abrir é só resgatar o que já foi pago — limitar ali só
 * atrapalharia quem juntou caixa do voto.
 *
 * ## Por que a caixa não conta para a proteção contra azar
 *
 * As redes do `/roll` existem para quem está sem sorte. Quem abre caixa
 * está pagando por sorte — deixar a caixa zerar os contadores permitiria
 * comprar o reset da rede, e a proteção deixaria de ser proteção.
 */

const MAXIMO_POR_COMPRA = 10;

function embedDaLoja(user, t) {
    const saldo = Number(user?.balance) || 0;

    const embed = ui.base()
        .setTitle(t('caixa.titulo'))
        .setDescription([
            t('caixa.como_usar'),
            '',
            t('loja.seu_saldo', { saldo: ui.coins(saldo, t.locale) })
        ].join('\n'));

    for (const caixa of caixas.todas(t.locale)) {
        const tem = bolsa.quantidadeDe(user, caixas.chaveNaBolsa(caixa.chave));
        const restam = limiteDiario.restante(user, 'caixa', caixa.chave, caixa.limiteDia);

        // A distribuição fica visível de propósito. Caixa que esconde a
        // chance é o que dá má fama a lootbox — e aqui não há o que
        // esconder, porque a caixa é paga com moeda do jogo.
        const chances = Object.entries(caixa.distribuicao)
            .map(([r, c]) => `${ui.getRarity(r, t.locale).emoji} ${c}%`)
            .join(' · ');

        const linhas = [
            caixa.descricao,
            `> ${chances}`,
            caixa.detalhe ? `> *${caixa.detalhe}*` : null,
            tem > 0 ? `> ${t('caixa.voce_tem', { quantidade: ui.number(tem, t.locale) })}` : null,
            caixa.preco != null && restam !== null
                ? `> ${t('caixa.hoje', { restam, limite: caixa.limiteDia })}`
                : null
        ].filter(Boolean);

        embed.addFields({
            name: `${caixa.emoji} ${caixa.nome} — ${caixa.preco == null ? t('caixa.nao_esta_a_venda') : ui.coins(caixa.preco, t.locale)}`,
            value: linhas.join('\n')
        });
    }

    embed.setFooter({ text: `${ui.BRAND} • ${t('loja.rodape_sink')}` });
    return embed;
}

async function comprar(interaction, t) {
    const chave = interaction.options.getString('box');
    const quantidade = interaction.options.getInteger('amount') ?? 1;

    const caixa = caixas.localizarPorChave(chave, t.locale);
    if (!caixa || caixa.preco == null) {
        return interaction.reply({
            embeds: [ui.error(t('caixa.indisponivel'), t('caixa.indisponivel_texto'))],
            flags: MessageFlags.Ephemeral
        });
    }

    if (quantidade < 1 || quantidade > MAXIMO_POR_COMPRA) {
        return interaction.reply({
            embeds: [ui.error(
                t('loja.quantidade_invalida'),
                t('loja.quantidade_invalida_texto', { maximo: MAXIMO_POR_COMPRA })
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    // O limite vem ANTES do débito: recusar depois de cobrar exigiria
    // estornar, e estorno é onde moeda some quando algo falha no meio.
    const usos = [];
    for (let i = 0; i < quantidade; i++) {
        const r = await limiteDiario.consumir(interaction.user.id, 'caixa', caixa.chave, caixa.limiteDia);
        if (!r.ok) break;
        usos.push(r);
    }

    if (usos.length === 0) {
        return interaction.reply({
            embeds: [ui.warning(t('loja.limite_diario'), [
                t('caixa.limite_texto', {
                    limite: caixa.limiteDia,
                    caixa: `${caixa.emoji} **${caixa.nome}**`
                }),
                '',
                t('caixa.limite_porque')
            ].join('\n'))],
            flags: MessageFlags.Ephemeral
        });
    }

    const comprada = usos.length;
    const total = caixa.preco * comprada;

    const devolverLimite = async () => {
        for (let i = 0; i < comprada; i++) {
            await limiteDiario.devolver(interaction.user.id, 'caixa', caixa.chave);
        }
    };

    const debitado = await trySpend(interaction.user.id, total);
    if (!debitado) {
        await devolverLimite();
        const user = await User.findOne({ id: interaction.user.id }).lean();
        const saldo = Number(user?.balance) || 0;
        return interaction.reply({
            embeds: [ui.warning(t('comum.saldo_insuficiente'), [
                t('loja.custo_da_compra', {
                    item: `${caixa.emoji} **${caixa.nome}**`,
                    quantidade: comprada,
                    total: ui.coins(total, t.locale)
                }),
                t('loja.faltam', {
                    saldo: ui.coins(saldo, t.locale),
                    falta: ui.coins(total - saldo, t.locale)
                })
            ].join('\n'))],
            flags: MessageFlags.Ephemeral
        });
    }

    // A moeda já saiu. Se a entrega falhar, ela PRECISA voltar.
    let guardadas;
    try {
        guardadas = await bolsa.adicionar(interaction.user.id, caixas.chaveNaBolsa(caixa.chave), comprada);
    } catch (err) {
        await addBalance(interaction.user.id, total).catch(() => {});
        await devolverLimite();
        throw err;
    }

    transacoes.registrar({
        userId: interaction.user.id,
        tipo: 'compra',
        itens: [{ chave: caixas.chaveNaBolsa(caixa.chave), quantidade: comprada }],
        moedaDelta: -total,
        saldoDepois: debitado.balance,
        contexto: { caixa: caixa.chave, precoUnitario: caixa.preco }
    });

    const aviso = comprada < quantidade
        ? `\n\n⚠️ *${t('caixa.limite_cortou', { pedido: quantidade, comprado: comprada })}*`
        : '';

    return interaction.reply({
        embeds: [ui.success(t('caixa.guardada'), [
            `${caixa.emoji} **${caixa.nome}** x${ui.number(comprada, t.locale)}`,
            '',
            t('loja.pagou', {
                total: ui.coins(total, t.locale),
                saldo: ui.coins(debitado.balance, t.locale)
            }),
            t('loja.na_bolsa_agora', { quantidade: ui.number(guardadas, t.locale) }),
            '',
            `${t('caixa.abra_quando_quiser')}${aviso}`
        ].join('\n'))],
        flags: MessageFlags.Ephemeral
    });
}

/** Sorteia a carta que sai da caixa, respeitando série quando houver. */
async function sortearCarta(caixa, serie) {
    const raridade = caixas.sortearRaridade(caixa);

    // Mesma trava do /roll: carta fora de rotação não sai de caixa.
    const filtro = { rarity: raridade, distribuivel: { $ne: false } };
    if (serie) filtro.series = serie;

    let resultado = await Card.aggregate([{ $match: filtro }, { $sample: { size: 1 } }]);

    // Série sem carta daquela raridade: cai para a série inteira antes de
    // desistir. O jogador escolheu a MIRA, então errar a raridade é menos
    // grave que entregar carta de outra série.
    if (resultado.length === 0 && serie) {
        resultado = await Card.aggregate([
            { $match: { series: serie, distribuivel: { $ne: false } } },
            { $sample: { size: 1 } }
        ]);
    }
    if (resultado.length === 0) {
        resultado = await Card.aggregate([
            { $match: { rarity: raridade, distribuivel: { $ne: false } } },
            { $sample: { size: 1 } }
        ]);
    }

    return resultado[0] || null;
}

async function abrir(interaction, t) {
    const chave = interaction.options.getString('box');
    const serie = interaction.options.getString('series') || null;

    const caixa = caixas.localizarPorChave(chave, t.locale);
    if (!caixa) {
        return interaction.reply({
            embeds: [ui.error(t('caixa.desconhecida'), t('caixa.desconhecida_texto'))],
            flags: MessageFlags.Ephemeral
        });
    }

    if (caixa.serie && !serie) {
        return interaction.reply({
            embeds: [ui.error(t('caixa.escolha_serie'), t('caixa.escolha_serie_texto', { caixa: caixa.nome }))],
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply();

    // Consome PRIMEIRO e de forma atômica: quem decide se há caixa é o
    // banco, no mesmo instante da escrita.
    const chaveBolsa = caixas.chaveNaBolsa(caixa.chave);
    const apos = await bolsa.consumir(interaction.user.id, chaveBolsa, 1);
    if (!apos) {
        return interaction.editReply({
            embeds: [ui.warning(t('caixa.nao_tem'), [
                t('caixa.nao_tem_texto', { caixa: `${caixa.emoji} **${caixa.nome}**` }),
                caixa.preco == null
                    ? t('caixa.nao_tem_apoiador')
                    : t('caixa.nao_tem_compre', { preco: ui.coins(caixa.preco, t.locale) })
            ].join('\n'))]
        });
    }

    const card = await sortearCarta(caixa, serie);
    if (!card) {
        // A caixa já saiu da bolsa: devolve, senão o jogador perde o que
        // pagou por um catálogo vazio.
        await bolsa.adicionar(interaction.user.id, chaveBolsa, 1).catch(() => {});
        return interaction.editReply({
            embeds: [ui.error(t('caixa.sem_carta'), t('caixa.sem_carta_texto'))]
        });
    }

    const user = await User.findOne({ id: interaction.user.id });
    const { marketValue, valueToSell } = valores.valoresDaCarta(card);

    // A carta vai DIRETO para o inventário. Diferente do /roll, aqui não
    // há escolha entre guardar e vender: o jogador já pagou pela carta, e
    // oferecer a venda rápida na mesma tela seria empurrar o pior negócio
    // logo depois de ele ter feito o melhor.
    const copia = {
        cardId: new mongoose.Types.ObjectId(),
        originalCardId: card._id,
        name: card.name,
        series: card.series,
        seriesImage: card.seriesImage,
        baseImage: card.baseImage,
        characterImage: card.characterImage,
        rarity: card.rarity,
        overall: card.overall,
        ATA: card.ATA,
        LIF: card.LIF,
        POW: card.POW,
        // Congela a negociabilidade — ver rollCollect.js.
        comercializavel: card.comercializavel !== false,
        obtainedAt: new Date(),
        marketValue,
        valueToSell
    };

    await User.updateOne({ id: interaction.user.id }, { $push: { inventory: copia } });

    const render = await renderCard(card, { moldura: molduraEfetiva(user) });
    const meta = ui.getRarity(card.rarity, t.locale);

    const embed = ui.base(meta.color)
        .setAuthor({
            name: t('caixa.autor', { jogador: interaction.user.username }),
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTitle(`${caixa.emoji} ${caixa.nome} → ${meta.emoji} ${ui.cardName(card)}`)
        .setDescription([
            `*${card.series}*`,
            '',
            ui.statLines(card, t.locale),
            '',
            t('roll.linha_raridade', {
                raridade: ui.rarityTag(card.rarity, t.locale),
                overall: card.overall
            })
        ].join('\n'))
        .addFields({ name: t('roll.valor_mercado'), value: ui.coins(marketValue, t.locale), inline: true })
        .setImage(render.url)
        .setFooter({ text: `${ui.BRAND} • ${t('caixa.ja_no_inventario')}` });

    await interaction.editReply({ embeds: [embed], files: [render.attachment] });

    transacoes.registrar({
        userId: interaction.user.id,
        tipo: 'caixa',
        itens: [{ chave: chaveBolsa, quantidade: -1 }],
        contexto: {
            caixa: caixa.chave,
            serie: serie || null,
            carta: card.name,
            raridade: card.rarity,
            overall: card.overall,
            valor: marketValue
        }
    });

    const inedita = await registerDiscovery(interaction.user.id, card._id);
    if (inedita) {
        registrar(interaction.user.id, {}, { eventosMissao: ['descoberta'] }).catch(() => {});
    }

    return null;
}

module.exports = async (client, interaction) => {
    const t = await tDaInteracao(interaction);
    const sub = interaction.options.getSubcommand(false);

    if (sub === 'buy') return comprar(interaction, t);
    if (sub === 'open') return abrir(interaction, t);

    const user = await User.findOne({ id: interaction.user.id }).lean();
    return interaction.reply({ embeds: [embedDaLoja(user, t)], flags: MessageFlags.Ephemeral });
};

module.exports.embedDaLoja = embedDaLoja;
module.exports.sortearCarta = sortearCarta;
module.exports.MAXIMO_POR_COMPRA = MAXIMO_POR_COMPRA;
