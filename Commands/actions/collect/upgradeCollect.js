const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const bolsa = require('../../utils/bag');
const aprimoramento = require('../../utils/upgrading');
const transacoes = require('../../utils/transactions');
const { montarEmbed, montarBotoes } = require('../run/upgradeRun');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

/**
 * Grava o resultado da tentativa na cópia do inventário.
 *
 * Escreve pelo `_id` da subdocument e exige que ela ainda esteja lá: se a
 * carta saiu do inventário no meio da tentativa (vendida em outro canal,
 * desmanchada, anunciada no mercado), a escrita não acha nada e o
 * `$set` não cria carta nenhuma de volta.
 */
async function gravar(userId, card, resultado) {
    return User.findOneAndUpdate(
        { id: userId, 'inventory._id': card._id },
        {
            $set: {
                'inventory.$.nivel': resultado.nivel,
                'inventory.$.overall': resultado.overall,
                'inventory.$.ATA': resultado.ATA,
                'inventory.$.LIF': resultado.LIF,
                'inventory.$.POW': resultado.POW,
                'inventory.$.marketValue': resultado.marketValue,
                'inventory.$.valueToSell': resultado.valueToSell,
                // Grava o natural na primeira tentativa e nunca mais mexe:
                // é ele que todo cálculo futuro usa como origem.
                'inventory.$.base': resultado.base
            }
        },
        { new: true }
    );
}

function embedDoResultado(card, desfecho, protegido, antes, resultado, gemasRestantes, t) {
    const meta = ui.getRarity(card.rarity, t.locale);
    const nome = ui.cardName(card);
    const restantes = t('aprimorar.gemas_restantes', { quantidade: ui.number(gemasRestantes, t.locale) });

    const detalhes = [
        t('aprimorar.overall_depois', { antes: antes.overall, depois: resultado.overall }),
        t('aprimorar.stats_depois', {
            ata: t('atributos.ata'), ataAntes: antes.ATA, ataDepois: resultado.ATA,
            lif: t('atributos.lif'), lifAntes: antes.LIF, lifDepois: resultado.LIF,
            pow: t('atributos.pow'), powAntes: antes.POW, powDepois: resultado.POW
        }),
        '',
        restantes
    ].join('\n');

    if (desfecho === 'sucesso') {
        return ui.success(t('aprimorar.sucesso', { carta: nome, nivel: resultado.nivel }), detalhes)
            .setColor(meta.color);
    }

    if (desfecho === 'queda' && protegido) {
        return ui.info(t('aprimorar.protegido_titulo'), [
            t('aprimorar.protegido_texto', { carta: nome, nivel: Math.max(0, resultado.nivel - 1) }),
            t('aprimorar.protegido_continua', { nivel: resultado.nivel }),
            '',
            restantes
        ].join('\n'));
    }

    if (desfecho === 'queda') {
        return ui.warning(t('aprimorar.queda', { carta: nome, nivel: resultado.nivel }), detalhes);
    }

    return ui.neutral(t('aprimorar.nada_titulo'), [
        t('aprimorar.nada_texto', {
            carta: nome,
            nivel: resultado.nivel > 0 ? `**+${resultado.nivel}**` : t('aprimorar.nivel_natural')
        }),
        t('aprimorar.gema_gasta'),
        '',
        restantes
    ].join('\n'));
}

async function aprimorarCollect(i, indexRef, matchingCards, user, rowNavigation, t = criarT(DEFAULT_LOCALE)) {
    if (i.customId === 'prev' || i.customId === 'next') {
        indexRef.currentIndex = i.customId === 'next'
            ? (indexRef.currentIndex + 1) % matchingCards.length
            : (indexRef.currentIndex - 1 + matchingCards.length) % matchingCards.length;

        const card = matchingCards[indexRef.currentIndex];
        await i.update({
            embeds: [montarEmbed(card, user, t)],
            components: [rowNavigation, montarBotoes(card, user, t)]
        });
        return;
    }

    if (i.customId === 'cancel_aprimorar') {
        await i.update({
            embeds: [ui.neutral(t('aprimorar.cancelado'), t('aprimorar.cancelado_texto'))],
            components: []
        });
        return 'collected';
    }

    if (i.customId !== 'confirm_aprimorar' && i.customId !== 'confirm_aprimorar_protegido') return;

    const card = matchingCards[indexRef.currentIndex];
    const querProtecao = i.customId === 'confirm_aprimorar_protegido';
    const nivel = Math.max(0, Number(card.nivel) || 0);
    const custo = aprimoramento.custoEmGemas(card.rarity, nivel);

    // A gema sai PRIMEIRO e de forma atômica. É o banco que decide se há
    // material, na mesma escrita: conferir antes no Node deixaria dois
    // cliques rápidos gastarem a mesma gema duas vezes.
    const aposGasto = await bolsa.consumir(i.user.id, 'gema', custo);
    if (!aposGasto) {
        await i.update({
            embeds: [ui.error(
                t('aprimorar.sem_gemas'),
                t('aprimorar.sem_gemas_texto', { custo: ui.number(custo, t.locale) })
            )],
            components: []
        });
        return 'collected';
    }

    const desfecho = aprimoramento.resolver(card.rarity, nivel);

    // O pergaminho só é consumido quando REALMENTE segura uma queda. Ele
    // não muda a chance de sucesso — é seguro, não atalho — então gastá-lo
    // num sucesso ou num "nada" seria queimar 25.000 moedas à toa.
    let protegido = false;
    if (desfecho === 'queda' && querProtecao) {
        protegido = (await bolsa.consumir(i.user.id, 'pergaminho', 1)) !== null;
    }

    const base = aprimoramento.baseDaCarta(card);
    const antes = aprimoramento.statsDoNivel(base, nivel);
    const resultado = aprimoramento.aplicar(card, desfecho, protegido);

    const gravado = await gravar(i.user.id, card, resultado);
    if (!gravado) {
        await i.update({
            embeds: [ui.error(
                t('aprimorar.carta_sumiu'),
                t('aprimorar.carta_sumiu_texto', {
                    custo: ui.number(custo, t.locale),
                    carta: ui.cardName(card)
                })
            )],
            components: []
        });
        return 'collected';
    }

    // Livro-razão.
    //
    // É a linha mais rica do extrato: guarda o desfecho, o nível antes e
    // depois e se o pergaminho foi queimado. Sem isso, "gastei 200 gemas e
    // não subi nada" é palavra do jogador contra a sua — com isso, dá para
    // conferir a sequência exata de tentativas.
    //
    // A gema aparece negativa porque saiu da bolsa; `moedaDelta` fica em
    // zero porque aprimorar não mexe em saldo.
    transacoes.registrar({
        userId: i.user.id,
        tipo: 'aprimoramento',
        itens: [
            { chave: 'gema', quantidade: -custo },
            ...(protegido ? [{ chave: 'pergaminho', quantidade: -1 }] : [])
        ],
        contexto: {
            carta: card.name,
            raridade: card.rarity,
            desfecho,
            protegido,
            nivelAntes: nivel,
            nivelDepois: resultado.nivel,
            overallAntes: antes.overall,
            overallDepois: resultado.overall
        }
    });

    // Mantém o objeto em memória alinhado, para o caso de o jogador
    // navegar de volta para esta carta sem reabrir o comando.
    Object.assign(card, resultado);

    const gemasRestantes = bolsa.quantidadeDe(gravado, 'gema');
    await i.update({
        embeds: [embedDoResultado(card, desfecho, protegido, antes, resultado, gemasRestantes, t)],
        components: []
    });
    return 'collected';
}

module.exports = aprimorarCollect;
