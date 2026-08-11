const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * Catálogo de itens da bolsa.
 *
 * No mesmo espírito do `achievements.js`: definição declarativa, um lugar
 * só. Item novo entra aqui e aparece na `/bolsa` e na `/loja` sozinho.
 *
 * ## A regra que sustenta a economia: item NÃO vira moeda
 *
 * Nada aqui pode ser vendido, trocado ou convertido de volta em moeda.
 * A moeda entra em item e para ali.
 *
 * Isso não é preciosismo. No momento em que existe um caminho de volta,
 * abre-se uma alça: compra barato de um lado, converte, vende do outro, e
 * a diferença vira renda infinita. É o mesmo motivo pelo qual a venda
 * rápida paga cada vez menos conforme a raridade sobe.
 *
 * ## Por que a gema é comprada com MOEDA
 *
 * A loja existe para tirar moeda de circulação. Hoje o único sink do jogo
 * é a taxa de 5% do mercado, enquanto `/daily`, missões, batalhas e venda
 * rápida criam moeda todo dia — ver o cabeçalho de `utils/economy.js`.
 *
 * A gema é o sink principal porque é consumível: ela some ao ser usada,
 * ao contrário de uma moldura, que se compra uma vez.
 *
 * ## Como a gema conversa com o /desmanchar
 *
 * São duas portas para a mesma gema: comprar com moeda, ou desmanchar uma
 * carta. A tabela de desmanche foi calibrada contra a venda rápida para
 * que as duas portas façam sentido ao mesmo tempo:
 *
 * | Carta | Venda rápida | Desmanche | Vale (em moeda) | Melhor |
 * |---|---|---|---|---|
 * | Comum ovr 50 | 30 | 1 gema | 150 | desmanchar |
 * | Rara ovr 60 | 167 | 3 gemas | 450 | desmanchar |
 * | Ultra ovr 75 | 805 | 10 gemas | 1.500 | desmanchar |
 * | Lendária ovr 88 | 5.526 | 40 gemas | 6.000 | desmanchar |
 * | **Mestra ovr 95** | **28.575** | 150 gemas | 22.500 | **vender** |
 *
 * Duas coisas caem no lugar de uma vez:
 *
 * 1. **A Comum ganha função.** Desmanchar rende 5x mais que a venda
 *    rápida, e a Comum agora sai em 64% dos rolls.
 * 2. **A Mestra não é picotada.** Ela é a única em que vender ainda vence,
 *    então ninguém é empurrado a destruir a carta mais rara do jogo por
 *    material. Se um dia isso se inverter, é sinal de que o preço da gema
 *    subiu demais.
 *
 * E como desmanchar NÃO cria moeda (a carta vira item, não saldo), cada
 * carta desmanchada é uma venda rápida que deixou de imprimir dinheiro.
 */

/**
 * Preço da gema.
 *
 * Ele é a régua de tudo: a tabela de desmanche acima só continua fazendo
 * sentido enquanto este número não se afastar da venda rápida. Existe um
 * teste que confere isso e falha se a Mestra passar a valer mais
 * desmanchada do que vendida.
 */
const PRECO_GEMA = Number(process.env.PRECO_GEMA) > 0 ? Number(process.env.PRECO_GEMA) : 150;

/**
 * Quantas gemas cada raridade rende no `/desmanchar`.
 *
 * A curva é bem mais achatada que a de preço (a Mestra vale 2.500x uma
 * Comum em moeda, mas rende só 150x em gema) porque material de
 * aprimoramento não pode herdar a escala da economia: se rendesse na
 * mesma proporção, uma única Mestra bancaria o aprimoramento de um acervo
 * inteiro.
 */
const GEMAS_POR_DESMANCHE = {
    common: 1,
    rare: 3,
    'ultra rare': 10,
    legendary: 40,
    master: 150,
    // Existe para a tabela ficar completa, mas o /desmanchar RECUSA
    // carta de evento — ver `podeDesmanchar` em utils/negociabilidade.js.
    event: 200
};

/**
 * Catálogo.
 *
 * Guarda MECÂNICA, não texto: nome, descrição e detalhe saem do
 * dicionário por `localizar()`, em `itens_catalogo.<chave>`. A chave é o
 * que fica gravado na bolsa do jogador, então trocar um texto nunca mexe
 * no que ele já tem guardado.
 *
 * - `chave`      identificador no banco. Vira caminho de campo no Mongo,
 *                então só letras minúsculas e `_` — ver `utils/bolsa.js`.
 * - `preco`      null = não está à venda (só se obtém jogando).
 * - `limiteDia`  null = sem limite diário.
 * - `consumivel` some ao ser usado. O que não é consumível é permanente.
 * - `temDetalhe` o item tem linha de detalhe no dicionário.
 */
const ITENS = {
    gema: {
        chave: 'gema',
        emoji: '💎',
        temDetalhe: true,
        preco: PRECO_GEMA,
        limiteDia: null,
        consumivel: true,
        ordem: 1
    },
    /**
     * Roll extra guardado.
     *
     * `preco: null` porque ele NÃO é comprado no `/loja comprar`: o preço
     * dele escalona dentro do dia (ver `utils/rollExtra.js`), e um item de
     * preço fixo não conseguiria representar isso. A compra tem porta
     * própria, `/loja roll-extra`.
     *
     * Mesmo padrão da Caixa do Apoiador: item conhecido pela bolsa, fora
     * da vitrine.
     */
    roll_extra: {
        chave: 'roll_extra',
        emoji: '🎟️',
        temDetalhe: true,
        preco: null,
        limiteDia: null,
        consumivel: true,
        ordem: 3
    },
    pergaminho: {
        chave: 'pergaminho',
        emoji: '📜',
        temDetalhe: true,
        preco: 25000,
        limiteDia: null,
        consumivel: true,
        ordem: 2
    }
};

/**
 * O item com nome, descrição e detalhe no idioma pedido.
 *
 * Nenhuma tela pode ler `item.nome` direto do catálogo — ele não existe
 * mais lá. Mesmo contrato de `achievements.localizar()`.
 */
function localizar(item, locale = DEFAULT_LOCALE) {
    if (!item) return null;
    return {
        ...item,
        nome: traduzir(locale, `itens_catalogo.${item.chave}.nome`),
        descricao: traduzir(locale, `itens_catalogo.${item.chave}.descricao`),
        detalhe: item.temDetalhe
            ? traduzir(locale, `itens_catalogo.${item.chave}.detalhe`)
            : null
    };
}

/** Atalho: pega pela chave já traduzido. */
function localizarPorChave(chave, locale = DEFAULT_LOCALE) {
    return localizar(getItem(chave), locale);
}

/** Itens à venda, na ordem em que aparecem na loja, já no idioma pedido. */
function itensDaLoja(locale = DEFAULT_LOCALE) {
    return Object.values(ITENS)
        .filter((i) => i.preco != null)
        .sort((a, b) => a.ordem - b.ordem)
        .map((i) => localizar(i, locale));
}

function getItem(chave) {
    return ITENS[String(chave || '').toLowerCase().trim()] || null;
}

/** A chave existe no catálogo? Guarda de tudo que escreve na bolsa. */
function existe(chave) {
    return getItem(chave) !== null;
}

/**
 * Quantas gemas esta carta rende ao ser desmanchada.
 * Nunca menos de 1: carta que rendesse zero seria só uma carta perdida.
 */
function gemasDoDesmanche(rarity) {
    const chave = String(rarity || 'common').toLowerCase().trim();
    return GEMAS_POR_DESMANCHE[chave] ?? GEMAS_POR_DESMANCHE.common;
}

module.exports = {
    ITENS,
    PRECO_GEMA,
    GEMAS_POR_DESMANCHE,
    itensDaLoja,
    getItem,
    localizar,
    localizarPorChave,
    existe,
    gemasDoDesmanche
};
