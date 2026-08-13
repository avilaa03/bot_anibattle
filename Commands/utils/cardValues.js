/**
 * Quanto vale uma carta.
 *
 * ## O que estava errado
 *
 * A fórmula antiga era `overall * 10`, com venda rápida pela metade. A
 * raridade não entrava na conta. Resultado real, medido no jogo:
 *
 *   10 Comuns de overall 30  ->  1.500 moedas de venda rápida
 *   1 Mestra de overall 90   ->    900 moedas de valor CHEIO
 *
 * Dez cartas do fundo do balde valiam mais que a carta mais rara do jogo.
 * Com a Mestra indo para 1-em-1.000 no sorteio, isso ficaria absurdo.
 *
 * ## A ideia da fórmula nova
 *
 * A RARIDADE define a ordem de grandeza; o overall só move dentro da
 * faixa daquela raridade. Uma Comum excelente continua sendo uma Comum, e
 * nunca chega perto de uma Mestra ruim — que é como funciona qualquer
 * jogo de coleção, do CS a Magic.
 *
 * O overall mexe no valor em ±30% (fator de 0,7 a 1,3). É o suficiente
 * para valer a pena caçar a versão boa de uma carta, sem quebrar a
 * hierarquia entre raridades.
 *
 * ## Por que a venda rápida cai conforme a raridade sobe
 *
 * A venda rápida CRIA moeda do nada — é a torneira de inflação do jogo. O
 * mercado entre jogadores é soma zero menos a taxa de 5%, mas o quicksell
 * imprime dinheiro do nada.
 *
 * Então ele paga bem para carta repetida (que é o propósito dele) e paga
 * mal para carta rara, empurrando quem tirou uma Mestra para o mercado de
 * jogadores — onde a moeda troca de mãos em vez de ser criada, e ainda
 * paga taxa.
 *
 * ## Ajuste sem deploy
 *
 * `VALOR_MULTIPLICADOR` no .env escala tudo de uma vez. A primeira semana
 * depois da virada é a que mais vai pedir ajuste, e reiniciar o bot com
 * uma variável nova é mais rápido que abrir PR.
 */

// `vip.js` só depende de `i18n.js`, então não há ciclo aqui — e o bônus de
// venda rápida precisa da mesma fonte de vantagens que o resto do bot usa.
const { getPerks } = require('./vip');

const RARIDADE_PADRAO = 'common';

/** Valor de referência de cada raridade, para uma carta de overall 50. */
const VALOR_BASE = {
    common: 60,
    rare: 350,
    'ultra rare': 2000,
    legendary: 18000,
    master: 150000,
    // Acima da Mestra: a carta de evento não pode ser obtida de novo
    // depois que a distribuição fecha, e escassez permanente é o que o
    // mercado precifica. É só a REFERÊNCIA — quem decide o preço de
    // verdade são os jogadores.
    event: 400000
};

/**
 * Quanto da venda rápida o jogador recebe.
 *
 * Cai conforme a raridade sobe, de propósito — ver o cabeçalho.
 */
const QUICKSELL_PCT = {
    common: 0.50,
    rare: 0.45,
    'ultra rare': 0.35,
    legendary: 0.25,
    master: 0.15,
    // A menor de todas: vender carta de evento ao bot deveria ser sempre
    // o pior negócio possível.
    event: 0.10
};

// O overall desloca o valor entre 70% e 130% da base.
const FATOR_MINIMO = 0.7;
const FAIXA_DO_OVERALL = 0.6;

/** Escala global, para calibrar a economia sem alterar código. */
const MULTIPLICADOR = Number(process.env.VALOR_MULTIPLICADOR) > 0
    ? Number(process.env.VALOR_MULTIPLICADOR)
    : 1;

function normalizarRaridade(rarity) {
    const chave = String(rarity || RARIDADE_PADRAO).toLowerCase().trim();
    return VALOR_BASE[chave] !== undefined ? chave : RARIDADE_PADRAO;
}

/**
 * O overall de uma carta.
 *
 * ## Por que isto existe e por que NÃO usa o valor de mercado
 *
 * Doze arquivos tinham, cada um, a própria cópia disto — e todos caíam em
 * `Math.round(marketValue / 10)` quando o campo `overall` faltava. Isso
 * funcionava enquanto o valor era literalmente `overall * 10`.
 *
 * Com a raridade na fórmula, aquela conta inversa passaria a devolver
 * overall errado EM SILÊNCIO: uma Mestra de 95 viraria "overall 19.050".
 * Não quebraria nada visivelmente — só mostraria número errado na ficha,
 * no inventário, no mercado e na escolha de time da batalha.
 *
 * A migração (`scripts/migrarValores.js`) preenche `overall` em todo o
 * acervo, e `tests/valores.test.js` falha se alguém trouxer a conta
 * inversa de volta.
 */
function overallDaCarta(card) {
    if (!card) return 0;
    const valor = card.overall ?? card.ovr;
    return Number.isFinite(Number(valor)) ? Number(valor) : 0;
}

/** Valor de mercado de referência da carta. */
function valorDeMercado(rarity, overall) {
    const base = VALOR_BASE[normalizarRaridade(rarity)];
    const ovr = Math.max(0, Number(overall) || 0);
    const fator = FATOR_MINIMO + FAIXA_DO_OVERALL * (ovr / 100);
    return Math.max(1, Math.round(base * fator * MULTIPLICADOR));
}

/** Quanto a venda rápida paga por essa carta. */
function valorDeVenda(rarity, overall) {
    const pct = QUICKSELL_PCT[normalizarRaridade(rarity)];
    return Math.max(1, Math.round(valorDeMercado(rarity, overall) * pct));
}

/**
 * Os dois valores de uma carta já existente.
 * @returns {{ marketValue: number, valueToSell: number, overall: number, rarity: string }}
 */
function valoresDaCarta(card) {
    const rarity = normalizarRaridade(card?.rarity);
    const overall = overallDaCarta(card);
    return {
        rarity,
        overall,
        marketValue: valorDeMercado(rarity, overall),
        valueToSell: valorDeVenda(rarity, overall)
    };
}

/**
 * Quanto a venda rápida paga DE FATO para um jogador específico.
 *
 * ## Por que o bônus do VIP não é gravado na carta
 *
 * `valueToSell` fica salvo no inventário (ver `rollCollect.js`). Se o
 * bônus entrasse ali, a carta rolada durante a assinatura pagaria a mais
 * para sempre — inclusive depois do plano vencer, e inclusive para o
 * jogador seguinte, porque o campo viaja no mercado e na troca.
 *
 * Então o que fica gravado é sempre o valor NATURAL da carta, e o bônus é
 * aplicado no instante do crédito, contra o plano de quem está vendendo
 * naquele momento. É a mesma regra da taxa do mercado.
 *
 * ⚠️ Toda tela que MOSTRA o valor da venda rápida tem que passar por aqui
 * também. Mostrar o valor natural e creditar o valor com bônus (ou o
 * contrário) é o tipo de divergência que ninguém reporta como bug — o
 * jogador só acha que o bot errou a conta.
 *
 * @param {object} card
 * @param {object|null} user quem está vendendo
 */
function vendaRapidaPara(card, user = null) {
    const base = card?.valueToSell ?? valoresDaCarta(card).valueToSell;
    const bonus = getPerks(user).bonusVendaRapida;
    return Math.max(1, Math.round((Number(base) || 0) * bonus));
}

/**
 * Recupera o overall de uma carta antiga, salva antes da migração.
 *
 * SÓ para o script de migração. Sob a fórmula ANTIGA (`overall * 10`), a
 * conta inversa era correta — é a única janela em que ela vale, e é por
 * isso que ela mora aqui, isolada e com nome que denuncia o uso, em vez
 * de espalhada por doze arquivos de comando.
 */
function overallLegado(card) {
    const direto = overallDaCarta(card);
    if (direto > 0) return direto;
    if (card?.marketValue != null) return Math.round(Number(card.marketValue) / 10);
    return 0;
}

module.exports = {
    VALOR_BASE,
    QUICKSELL_PCT,
    FATOR_MINIMO,
    FAIXA_DO_OVERALL,
    MULTIPLICADOR,
    normalizarRaridade,
    overallDaCarta,
    valorDeMercado,
    valorDeVenda,
    valoresDaCarta,
    vendaRapidaPara,
    overallLegado
};
