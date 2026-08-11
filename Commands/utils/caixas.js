const valores = require('./valores');
const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * Caixas: sorteio pago, com distribuição própria.
 *
 * ## A diferença para o /roll
 *
 * O `/roll` é grátis, tem cooldown e a mesma chance para todo mundo. A
 * caixa é comprada com moeda do jogo e tem distribuição melhor — é
 * economia de RPG, não venda de sorte. O princípio que continua de pé é o
 * outro: **dinheiro real nunca compra odds**.
 *
 * Vale reconhecer a corrente indireta: VIP dá mais rolls, mais rolls dão
 * mais moeda, e mais moeda compra mais caixa. É bem mais fraco que vender
 * odds, mas existe — e é por isso que o limite diário vale igual para
 * assinante e não assinante.
 *
 * ## O preço NASCE do valor esperado, e isso é o ponto todo
 *
 * A pergunta que decide se a caixa quebra a economia é uma só: **sai mais
 * valor do que entra?** Se sim, ela é uma impressora de dinheiro, e não
 * importa quão bonita seja a tela.
 *
 * A tentação é escrever o preço na mão. Só que existe um caminho que
 * quebra isso em silêncio: `VALOR_MULTIPLICADOR` escala o valor das
 * cartas e NÃO escalaria um preço fixo. Subir o multiplicador para
 * calibrar a economia transformaria uma caixa segura em impressora, sem
 * ninguém tocar no arquivo das caixas.
 *
 * Por isso o preço é **derivado** do valor esperado, com margem fixa. O
 * glitch fica impossível por construção, não por disciplina.
 *
 * ## Por que a referência é o valor de MERCADO
 *
 * A conta usa o valor de mercado, não o da venda rápida. O jogador pode
 * revender a carta a outro jogador pelo preço cheio, então é esse o teto
 * do que ele consegue extrair da caixa.
 *
 * Usar a venda rápida daria a impressão de uma folga enorme (ela paga de
 * 15% a 50%) e a caixa viraria lucro garantido para quem vende no
 * mercado — que é justamente quem abre caixa.
 */

/** Overall de referência para estimar o valor esperado. */
const OVR_REFERENCIA = 70;

/**
 * Quanto o preço fica acima do valor esperado.
 *
 * 1,6x não é chute: abaixo disso a variância deixa um jogador sortudo
 * lucrar de forma consistente o bastante para virar estratégia, e a caixa
 * deixa de ser sink para virar aposta com retorno.
 */
const MARGEM = 1.6;

/** Preços sobem para múltiplos disto, para não sair "6.437 moedas". */
const ARREDONDAMENTO = 500;

/**
 * As distribuições.
 *
 * Cada uma soma 100. A Comum é o piso e a Lendária o topo; a Temática
 * troca raridade por MIRA — ela vale pela série, não pelo prêmio.
 *
 * `serie: true` faz a caixa pedir uma série na hora de abrir.
 *
 * Como no catálogo de itens, aqui só entra mecânica: nome, descrição e
 * detalhe saem do dicionário em `caixas_catalogo.<chave>`, por
 * `localizar()`. A chave é o que vai para a bolsa do jogador.
 */
const CAIXAS = {
    comum: {
        chave: 'comum',
        emoji: '📦',
        distribuicao: { common: 40, rare: 45, 'ultra rare': 14, legendary: 1 },
        limiteDia: 5,
        ordem: 1
    },
    tematica: {
        chave: 'tematica',
        emoji: '🎯',
        temDetalhe: true,
        distribuicao: { rare: 70, 'ultra rare': 25, legendary: 4.5, master: 0.5 },
        serie: true,
        limiteDia: 3,
        ordem: 2
    },
    elite: {
        chave: 'elite',
        emoji: '💠',
        distribuicao: { 'ultra rare': 70, legendary: 27, master: 3 },
        limiteDia: 2,
        ordem: 3
    },
    lendaria: {
        chave: 'lendaria',
        emoji: '🌟',
        temDetalhe: true,
        distribuicao: { 'ultra rare': 50, legendary: 40, master: 10 },
        limiteDia: 1,
        ordem: 4
    },

    /**
     * Caixa de quem vota no bot.
     *
     * `preco: null` = não está à venda. Ela entra na bolsa por fora, e é
     * por isso que o sistema de caixas precisa aceitar caixa sem preço
     * desde já: sem isso, plugar o webhook de voto depois exigiria mexer
     * em toda a estrutura.
     */
    apoiador: {
        chave: 'apoiador',
        emoji: '💝',
        distribuicao: { rare: 60, 'ultra rare': 34, legendary: 5.5, master: 0.5 },
        preco: null,
        limiteDia: null,
        ordem: 5
    }
};

/**
 * Prefixo da caixa quando ela está guardada na bolsa.
 *
 * A caixa é comprada e GUARDADA, não aberta na hora. O jogador abre quando
 * quiser — e isso não é conveniência, é o que torna a Caixa do Apoiador
 * possível: ela não é comprada, é dada por votar. Se comprar e abrir
 * fossem o mesmo ato, não existiria caminho para uma caixa que ninguém
 * comprou.
 *
 * O prefixo evita colisão com item: nada impede alguém de criar um item
 * chamado `lendaria` amanhã, e as duas coisas dividem o mesmo Map no
 * banco. `caixa_lendaria` nunca colide com um item.
 */
const PREFIXO_BOLSA = 'caixa_';

function normalizar(chave) {
    return String(chave || '').toLowerCase().trim();
}

/** A chave desta caixa dentro da bolsa. */
function chaveNaBolsa(chave) {
    return `${PREFIXO_BOLSA}${normalizar(chave)}`;
}

/** A caixa correspondente a uma chave de bolsa, ou null se não for caixa. */
function daChaveDeBolsa(chaveDeBolsa) {
    const bruta = normalizar(chaveDeBolsa);
    if (!bruta.startsWith(PREFIXO_BOLSA)) return null;
    return getCaixa(bruta.slice(PREFIXO_BOLSA.length));
}

/** A chave de bolsa aponta para uma caixa conhecida? */
function existeNaBolsa(chaveDeBolsa) {
    return daChaveDeBolsa(chaveDeBolsa) !== null;
}

/**
 * Quanto vale, em média, o que sai desta caixa.
 *
 * Recalculado a cada chamada de propósito: `valores.js` lê o
 * `VALOR_MULTIPLICADOR` do ambiente, e o valor esperado precisa acompanhar
 * — é exatamente esse acoplamento que impede o preço de ficar para trás.
 */
function valorEsperado(caixa, ovr = OVR_REFERENCIA) {
    const dist = caixa?.distribuicao || {};
    let total = 0;
    for (const [raridade, chance] of Object.entries(dist)) {
        total += (Number(chance) / 100) * valores.valorDeMercado(raridade, ovr);
    }
    return total;
}

/** O preço, derivado do valor esperado. Nunca escrito na mão. */
function precoDaCaixa(caixa) {
    // Caixa sem preço não está à venda (a do apoiador, por exemplo).
    if (Object.prototype.hasOwnProperty.call(caixa, 'preco') && caixa.preco === null) return null;

    const minimo = valorEsperado(caixa) * MARGEM;
    return Math.ceil(minimo / ARREDONDAMENTO) * ARREDONDAMENTO;
}

/** A caixa com preço e valor esperado já calculados. */
function getCaixa(chave) {
    const bruta = CAIXAS[normalizar(chave)];
    if (!bruta) return null;

    return {
        ...bruta,
        preco: precoDaCaixa(bruta),
        valorEsperado: Math.round(valorEsperado(bruta))
    };
}

function existe(chave) {
    return CAIXAS[normalizar(chave)] !== undefined;
}

/** A caixa com nome, descrição e detalhe no idioma pedido. */
function localizar(caixa, locale = DEFAULT_LOCALE) {
    if (!caixa) return null;
    return {
        ...caixa,
        nome: traduzir(locale, `caixas_catalogo.${caixa.chave}.nome`),
        descricao: traduzir(locale, `caixas_catalogo.${caixa.chave}.descricao`),
        detalhe: caixa.temDetalhe
            ? traduzir(locale, `caixas_catalogo.${caixa.chave}.detalhe`)
            : null
    };
}

/** Atalho: pega pela chave, já com preço e texto no idioma. */
function localizarPorChave(chave, locale = DEFAULT_LOCALE) {
    return localizar(getCaixa(chave), locale);
}

/** Todas, na ordem de exibição, já no idioma pedido. */
function todas(locale = DEFAULT_LOCALE) {
    return Object.keys(CAIXAS)
        .map((chave) => localizar(getCaixa(chave), locale))
        .sort((a, b) => a.ordem - b.ordem);
}

/** Só as compráveis com moeda. */
function aVenda(locale = DEFAULT_LOCALE) {
    return todas(locale).filter((c) => c.preco != null);
}

/**
 * Sorteia a raridade que sai desta caixa.
 *
 * Não usa `sorteio.js` de propósito: aquele arquivo é o sorteio do
 * `/roll`, com a Comum como resto e as redes de proteção contra azar. A
 * caixa tem distribuição própria e explícita, e **não conta para as redes**
 * — quem abre caixa não está sem sorte, está pagando por ela.
 */
function sortearRaridade(caixa, aleatorio = Math.random) {
    const faixas = Object.entries(caixa?.distribuicao || {});
    const alvo = aleatorio() * 100;

    let acumulado = 0;
    for (const [raridade, chance] of faixas) {
        acumulado += Number(chance);
        if (alvo < acumulado) return raridade;
    }

    // Só chega aqui por arredondamento de ponto flutuante no limite.
    return faixas.length > 0 ? faixas[faixas.length - 1][0] : 'common';
}

module.exports = {
    CAIXAS,
    OVR_REFERENCIA,
    MARGEM,
    ARREDONDAMENTO,
    PREFIXO_BOLSA,
    valorEsperado,
    precoDaCaixa,
    getCaixa,
    localizar,
    localizarPorChave,
    existe,
    todas,
    aVenda,
    sortearRaridade,
    chaveNaBolsa,
    daChaveDeBolsa,
    existeNaBolsa
};
