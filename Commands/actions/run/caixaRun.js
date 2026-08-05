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

function embedDaLoja(user) {
    const saldo = Number(user?.balance) || 0;

    const embed = ui.base()
        .setTitle('🎁 Caixas')
        .setDescription([
            'Compre com `/caixa comprar` e abra quando quiser com `/caixa abrir`.',
            '',
            `Seu saldo: **${ui.coins(saldo)}**`
        ].join('\n'));

    for (const caixa of caixas.todas()) {
        const tem = bolsa.quantidadeDe(user, caixas.chaveNaBolsa(caixa.chave));
        const restam = limiteDiario.restante(user, 'caixa', caixa.chave, caixa.limiteDia);

        // A distribuição fica visível de propósito. Caixa que esconde a
        // chance é o que dá má fama a lootbox — e aqui não há o que
        // esconder, porque a caixa é paga com moeda do jogo.
        const chances = Object.entries(caixa.distribuicao)
            .map(([r, c]) => `${ui.getRarity(r).emoji} ${c}%`)
            .join(' · ');

        const linhas = [
            caixa.descricao,
            `> ${chances}`,
            caixa.detalhe ? `> *${caixa.detalhe}*` : null,
            tem > 0 ? `> Você tem **${ui.number(tem)}** guardada(s).` : null,
            caixa.preco != null && restam !== null ? `> Hoje: **${restam}** de ${caixa.limiteDia}` : null
        ].filter(Boolean);

        embed.addFields({
            name: `${caixa.emoji} ${caixa.nome} — ${caixa.preco == null ? 'não está à venda' : ui.coins(caixa.preco)}`,
            value: linhas.join('\n')
        });
    }

    embed.setFooter({ text: `${ui.BRAND} • A moeda gasta aqui sai de circulação` });
    return embed;
}

async function comprar(interaction) {
    const chave = interaction.options.getString('caixa');
    const quantidade = interaction.options.getInteger('quantidade') ?? 1;

    const caixa = caixas.getCaixa(chave);
    if (!caixa || caixa.preco == null) {
        return interaction.reply({
            embeds: [ui.error('Caixa indisponível', 'Essa caixa não está à venda.')],
            flags: MessageFlags.Ephemeral
        });
    }

    if (quantidade < 1 || quantidade > MAXIMO_POR_COMPRA) {
        return interaction.reply({
            embeds: [ui.error('Quantidade inválida', `Compre de 1 a ${MAXIMO_POR_COMPRA} por vez.`)],
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
            embeds: [ui.warning('Limite diário atingido', [
                `Você já comprou **${caixa.limiteDia}** ${caixa.emoji} **${caixa.nome}** hoje.`,
                '',
                'O limite existe para a caixa não virar torneira de cartas. Ele zera à meia-noite (UTC).'
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
            embeds: [ui.warning('Saldo insuficiente', [
                `${caixa.emoji} **${caixa.nome}** x${comprada} custa ${ui.coins(total)}.`,
                `Você tem ${ui.coins(saldo)} — faltam **${ui.coins(total - saldo)}**.`
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
        ? `\n\n⚠️ *Você pediu ${quantidade}, mas o limite de hoje deixou comprar ${comprada}.*`
        : '';

    return interaction.reply({
        embeds: [ui.success('Caixa guardada', [
            `${caixa.emoji} **${caixa.nome}** x${ui.number(comprada)}`,
            '',
            `Pagou ${ui.coins(total)} • Saldo: ${ui.coins(debitado.balance)}`,
            `Na bolsa agora: **${ui.number(guardadas)}**`,
            '',
            `Abra com \`/caixa abrir\` quando quiser.${aviso}`
        ].join('\n'))],
        flags: MessageFlags.Ephemeral
    });
}

/** Sorteia a carta que sai da caixa, respeitando série quando houver. */
async function sortearCarta(caixa, serie) {
    const raridade = caixas.sortearRaridade(caixa);

    const filtro = { rarity: raridade };
    if (serie) filtro.series = serie;

    let resultado = await Card.aggregate([{ $match: filtro }, { $sample: { size: 1 } }]);

    // Série sem carta daquela raridade: cai para a série inteira antes de
    // desistir. O jogador escolheu a MIRA, então errar a raridade é menos
    // grave que entregar carta de outra série.
    if (resultado.length === 0 && serie) {
        resultado = await Card.aggregate([{ $match: { series: serie } }, { $sample: { size: 1 } }]);
    }
    if (resultado.length === 0) {
        resultado = await Card.aggregate([{ $match: { rarity: raridade } }, { $sample: { size: 1 } }]);
    }

    return resultado[0] || null;
}

async function abrir(interaction) {
    const chave = interaction.options.getString('caixa');
    const serie = interaction.options.getString('serie') || null;

    const caixa = caixas.getCaixa(chave);
    if (!caixa) {
        return interaction.reply({
            embeds: [ui.error('Caixa desconhecida', 'Essa caixa não existe.')],
            flags: MessageFlags.Ephemeral
        });
    }

    if (caixa.serie && !serie) {
        return interaction.reply({
            embeds: [ui.error('Escolha a série', `A ${caixa.nome} precisa de uma série — é justamente o que ela mira.`)],
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
            embeds: [ui.warning('Você não tem essa caixa', [
                `Nenhuma ${caixa.emoji} **${caixa.nome}** na sua bolsa.`,
                caixa.preco == null
                    ? 'Ela não está à venda — é a recompensa de quem vota no bot.'
                    : `Compre com \`/caixa comprar\` por ${ui.coins(caixa.preco)}.`
            ].join('\n'))]
        });
    }

    const card = await sortearCarta(caixa, serie);
    if (!card) {
        // A caixa já saiu da bolsa: devolve, senão o jogador perde o que
        // pagou por um catálogo vazio.
        await bolsa.adicionar(interaction.user.id, chaveBolsa, 1).catch(() => {});
        return interaction.editReply({
            embeds: [ui.error('Nenhuma carta encontrada', 'Sua caixa foi devolvida à bolsa.')]
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
        obtainedAt: new Date(),
        marketValue,
        valueToSell
    };

    await User.updateOne({ id: interaction.user.id }, { $push: { inventory: copia } });

    const render = await renderCard(card, { moldura: molduraEfetiva(user) });
    const meta = ui.getRarity(card.rarity);

    const embed = ui.base(meta.color)
        .setAuthor({ name: `${interaction.user.username} abriu uma caixa`, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`${caixa.emoji} ${caixa.nome} → ${meta.emoji} ${ui.cardName(card)}`)
        .setDescription([
            `*${card.series}*`,
            '',
            ui.statLines(card),
            '',
            `Raridade ${ui.rarityTag(card.rarity)} • Overall **${card.overall}**`
        ].join('\n'))
        .addFields({ name: 'Valor de mercado', value: ui.coins(marketValue), inline: true })
        .setImage(render.url)
        .setFooter({ text: `${ui.BRAND} • A carta já está no seu inventário` });

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
    const sub = interaction.options.getSubcommand(false);

    if (sub === 'comprar') return comprar(interaction);
    if (sub === 'abrir') return abrir(interaction);

    const user = await User.findOne({ id: interaction.user.id }).lean();
    return interaction.reply({ embeds: [embedDaLoja(user)], flags: MessageFlags.Ephemeral });
};

module.exports.embedDaLoja = embedDaLoja;
module.exports.sortearCarta = sortearCarta;
module.exports.MAXIMO_POR_COMPRA = MAXIMO_POR_COMPRA;
