const { MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const itens = require('../../utils/itens');
const bolsa = require('../../utils/bolsa');
const { trySpend, addBalance } = require('../../utils/economy');
const transacoes = require('../../utils/transacoes');
const rollExtra = require('../../utils/rollExtra');
const limiteDiario = require('../../utils/limiteDiario');
const { getPerks } = require('../../utils/vip');
const { tDaInteracao } = require('../../utils/idioma');

// O cooldown do /roll mora no rollRun. Repetir a leitura do .env aqui
// manteria os dois em sincronia por disciplina; ler de lá garante.
const { ROLL_COOLDOWN_MS } = require('./rollRun');

/**
 * /loja — troca moeda por item.
 *
 * ## Para que ela existe
 *
 * Não é para dar poder a quem tem dinheiro: é para **tirar moeda de
 * circulação**. Hoje o único sink do jogo é a taxa de 5% do mercado,
 * enquanto `/daily`, missões, batalhas e venda rápida criam moeda todo
 * dia. Sem sink, tudo que entra fica para sempre e o mercado perde o
 * sentido — ver o cabeçalho de `utils/economy.js`.
 *
 * Por isso o carro-chefe é a gema, que é consumível: ela some ao ser
 * usada. Uma moldura se compra uma vez e nunca mais.
 */

// Teto por compra. Não é regra de jogo, é guarda contra o dedo escorregar
// num zero a mais e contra número absurdo virar total absurdo.
const MAXIMO_POR_COMPRA = 1000;

function embedDaLoja(user, t) {
    const saldo = Number(user?.balance) || 0;

    const embed = ui.base()
        .setTitle(t('loja.titulo'))
        .setDescription([
            t('loja.como_comprar'),
            '',
            t('loja.seu_saldo', { saldo: ui.coins(saldo, t.locale) })
        ].join('\n'));

    for (const item of itens.itensDaLoja(t.locale)) {
        const tem = bolsa.quantidadeDe(user, item.chave);
        embed.addFields({
            name: `${item.emoji} ${item.nome} — ${ui.coins(item.preco, t.locale)}`,
            value: [
                item.descricao,
                item.detalhe ? `> *${item.detalhe}*` : null,
                tem > 0 ? `> ${t('loja.voce_tem', { quantidade: ui.number(tem, t.locale) })}` : null
            ].filter(Boolean).join('\n')
        });
    }

    embed.setFooter({ text: `${ui.BRAND} • ${t('loja.rodape_sink')}` });
    return embed;
}

async function comprar(interaction, t) {
    const chave = interaction.options.getString('item');
    const quantidade = interaction.options.getInteger('quantidade') ?? 1;

    const item = itens.localizarPorChave(chave, t.locale);
    if (!item || item.preco == null) {
        return interaction.reply({
            embeds: [ui.error(t('loja.item_indisponivel'), t('loja.item_indisponivel_texto'))],
            flags: MessageFlags.Ephemeral
        });
    }

    if (quantidade < 1 || quantidade > MAXIMO_POR_COMPRA) {
        return interaction.reply({
            embeds: [ui.error(
                t('loja.quantidade_invalida'),
                t('loja.quantidade_invalida_texto', { maximo: ui.number(MAXIMO_POR_COMPRA, t.locale) })
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    const total = item.preco * quantidade;

    // Debita PRIMEIRO, e de forma atômica: é o banco que decide se há
    // saldo, no mesmo instante da escrita. Ler o saldo antes e conferir
    // aqui deixaria uma janela entre a leitura e a gravação — dois
    // comandos disparados junto passariam os dois pela conferência e o
    // jogador compraria mais do que tem.
    const debitado = await trySpend(interaction.user.id, total);
    if (!debitado) {
        const user = await User.findOne({ id: interaction.user.id }).lean();
        const saldo = Number(user?.balance) || 0;
        return interaction.reply({
            embeds: [ui.warning(t('comum.saldo_insuficiente'), [
                t('loja.custo_da_compra', {
                    item: `${item.emoji} **${item.nome}**`,
                    quantidade: ui.number(quantidade, t.locale),
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

    // A partir daqui a moeda já saiu. Se a entrega falhar, ela PRECISA
    // voltar: cobrar sem entregar é o único erro desta tela que o jogador
    // não tem como contornar sozinho.
    let quantidadeFinal;
    try {
        quantidadeFinal = await bolsa.adicionar(interaction.user.id, item.chave, quantidade);
    } catch (err) {
        await addBalance(interaction.user.id, total).catch(() => {});
        throw err;
    }

    // Livro-razão. Fica DEPOIS da entrega: registrar antes criaria linha
    // para compra que não aconteceu, e extrato que mente é pior que
    // extrato nenhum — ele é usado para investigar fraude.
    //
    // Sem await: o razão é observação, e uma falha nele não pode impedir
    // ninguém de comprar o que já foi pago.
    transacoes.compra({
        userId: interaction.user.id,
        item: item.chave,
        quantidade,
        total,
        saldoDepois: debitado.balance
    });

    const embed = ui.success(t('loja.compra_concluida'), [
        `${item.emoji} **${item.nome}** x${ui.number(quantidade, t.locale)}`,
        '',
        t('loja.pagou', {
            total: ui.coins(total, t.locale),
            saldo: ui.coins(debitado.balance, t.locale)
        }),
        t('loja.na_bolsa_agora', { quantidade: ui.number(quantidadeFinal, t.locale) })
    ].join('\n'));

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/**
 * Compra um roll extra e GUARDA na bolsa.
 *
 * ## Comprar e usar são atos separados
 *
 * A primeira versão adiantava o roll na hora da compra, e por isso só
 * deixava comprar durante o cooldown — fora dele a compra não teria
 * efeito nenhum. O jogador não conseguia estocar para a noite, que é
 * justamente quando quem trabalha usa o bot.
 *
 * Agora ele é um item: compra quando tem dinheiro, usa quando tem tempo,
 * com `/roll extra:True`. Mesmo desenho das caixas.
 *
 * ## A trava econômica não mudou de lugar
 *
 * O limite diário é de COMPRA. Estocar 3 por dia durante dez dias e
 * gastar 30 numa tarde não cria nenhuma carta a mais do que comprar e
 * usar na hora — só muda quando. O que limita a entrada de cartas
 * continua sendo quantos entram por dia.
 */
async function comprarRollExtra(interaction, t) {
    const user = await User.findOne({ id: interaction.user.id });

    if (!user) {
        return interaction.reply({
            embeds: [ui.error(t('loja.sem_perfil'), t('loja.sem_perfil_texto'))],
            flags: MessageFlags.Ephemeral
        });
    }

    const usados = limiteDiario.lerUso(user, rollExtra.GRUPO, rollExtra.CHAVE);
    const preco = rollExtra.precoDoProximo(usados);

    if (preco === null) {
        return interaction.reply({
            embeds: [ui.warning(t('loja.limite_diario'), [
                t('loja.limite_diario_texto', { limite: rollExtra.LIMITE_DIARIO }),
                '',
                t('loja.limite_diario_porque'),
                t('loja.limite_diario_zera')
            ].join('\n'))],
            flags: MessageFlags.Ephemeral
        });
    }

    // Limite antes do débito: recusar depois de cobrar exigiria estorno.
    const reserva = await limiteDiario.consumir(
        interaction.user.id, rollExtra.GRUPO, rollExtra.CHAVE, rollExtra.LIMITE_DIARIO
    );
    if (!reserva.ok) {
        return interaction.reply({
            embeds: [ui.warning(t('loja.limite_diario'), t('loja.limite_diario_esgotado'))],
            flags: MessageFlags.Ephemeral
        });
    }

    const debitado = await trySpend(interaction.user.id, preco);
    if (!debitado) {
        await limiteDiario.devolver(interaction.user.id, rollExtra.GRUPO, rollExtra.CHAVE);
        return interaction.reply({
            embeds: [ui.warning(t('comum.saldo_insuficiente'), [
                t('loja.roll_extra_custo', { n: usados + 1, preco: ui.coins(preco, t.locale) }),
                t('loja.voce_tem_saldo', { saldo: ui.coins(Number(user.balance) || 0, t.locale) })
            ].join('\n'))],
            flags: MessageFlags.Ephemeral
        });
    }

    // A moeda já saiu. Se a entrega falhar, ela PRECISA voltar.
    let guardados;
    try {
        guardados = await bolsa.adicionar(interaction.user.id, rollExtra.CHAVE_BOLSA, 1);
    } catch (err) {
        await addBalance(interaction.user.id, preco).catch(() => {});
        await limiteDiario.devolver(interaction.user.id, rollExtra.GRUPO, rollExtra.CHAVE);
        throw err;
    }

    transacoes.registrar({
        userId: interaction.user.id,
        tipo: 'roll_extra',
        itens: [{ chave: rollExtra.CHAVE_BOLSA, quantidade: 1 }],
        moedaDelta: -preco,
        saldoDepois: debitado.balance,
        contexto: { compraDoDia: usados + 1 }
    });

    const proximo = rollExtra.precoDoProximo(usados + 1);
    const item = itens.localizarPorChave('roll_extra', t.locale);

    return interaction.reply({
        embeds: [ui.success(t('loja.roll_extra_guardado'), [
            t('loja.roll_extra_pagou', { item: `${item.emoji} **${item.nome}**`, preco: ui.coins(preco, t.locale) }),
            t('loja.saldo_atual', { saldo: ui.coins(debitado.balance, t.locale) }),
            t('loja.na_bolsa_agora', { quantidade: ui.number(guardados, t.locale) }),
            '',
            t('loja.roll_extra_como_usar'),
            '',
            proximo === null
                ? `*${t('loja.roll_extra_ultimo')}*`
                : `*${t('loja.roll_extra_proximo', { preco: ui.coins(proximo, t.locale) })}*`
        ].join('\n'))],
        flags: MessageFlags.Ephemeral
    });
}

module.exports = async (client, interaction) => {
    const t = await tDaInteracao(interaction);
    const sub = interaction.options.getSubcommand(false);

    if (sub === 'comprar') return comprar(interaction, t);
    if (sub === 'roll-extra') return comprarRollExtra(interaction, t);

    const user = await User.findOne({ id: interaction.user.id }).lean();
    return interaction.reply({ embeds: [embedDaLoja(user, t)], flags: MessageFlags.Ephemeral });
};
