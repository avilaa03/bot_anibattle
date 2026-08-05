/**
 * Aprimoramento de cartas.
 *
 * ## A ideia
 *
 * Cada tentativa gasta gema e tem três desfechos: **sobe**, **não
 * acontece nada**, ou **cai um nível**. Conforme o nível sobe, a chance de
 * sucesso cai e a de queda cresce.
 *
 * **Não existe teto.** O nível pode subir para sempre, e a chance de
 * sucesso tem piso de 1% justamente para que o infinito seja real e não
 * uma promessa que a matemática desmente.
 *
 * O efeito disso é o ponto todo: uma carta em nível alto não é uma carta
 * cara, é uma carta **sortuda**. Como ela nunca pode ser reproduzida em
 * escala, ela vira peça única — e o mercado entre jogadores é quem decide
 * quanto isso vale.
 *
 * ## O piso: a carta nunca fica pior do que nasceu
 *
 * `nivel` nunca é negativo. A queda só existe a partir de +1, então uma
 * carta que nunca subiu não tem o que perder. O overall natural é o chão
 * absoluto, e é por isso que a queda em nível 0 é literalmente 0%: não
 * existe "carta arruinada" neste jogo.
 *
 * ## Quanto custa de verdade
 *
 * Medido em simulação de 3.000 cartas por marco, com a gema a 150 moedas:
 *
 * | Carta | +8 | +12 | +16 |
 * |---|---|---|---|
 * | Lendária (mediana) | 107 mil | 616 mil | 16,4 mi |
 * | Lendária (5% mais sortudos) | 51 mil | 195 mil | 1,5 mi |
 * | **Mestra (mediana)** | **250 mil** | **1,7 mi** | **93,6 mi** |
 * | **Mestra (5% mais sortudos)** | **112 mil** | **498 mil** | **7,8 mi** |
 *
 * Repare na distância entre a mediana e o sortudo: **12x** no topo. É
 * essa dispersão que faz a carta de nível alto valer o que vale — quem
 * chegou lá gastando 7,8 milhões tem algo que o vizinho não consegue
 * repetir nem com 90.
 *
 * Uma Mestra +16 é overall 111. É para ser raríssima, e a conta acima diz
 * que é.
 *
 * ## Os atributos acompanham o overall
 *
 * ATA, LIF e POW sobem na mesma proporção, então o perfil da carta se
 * mantém: uma carta de vida alta continua sendo de vida alta. Eles são
 * recalculados SEMPRE a partir dos valores naturais, nunca do valor já
 * aprimorado — aplicar percentual sobre percentual acumularia erro de
 * arredondamento a cada nível, e depois de 16 tentativas a carta teria
 * atributos que ninguém consegue explicar.
 */

const valores = require('./valores');

/** Chance de sucesso no nível 0. Quanto mais rara, mais difícil. */
const BASE_SUCESSO = {
    common: 0.90,
    rare: 0.80,
    'ultra rare': 0.70,
    legendary: 0.60,
    master: 0.50
};

/** Gemas na primeira tentativa. Cresce com o nível. */
const CUSTO_BASE = {
    common: 1,
    rare: 2,
    'ultra rare': 4,
    legendary: 8,
    master: 15
};

// A cada nível, a chance de sucesso vira 88% do que era.
const DECAIMENTO = 0.88;

/**
 * Piso da chance de sucesso.
 *
 * Sem ele, o decaimento levaria a chance a zero e o "sem teto" seria
 * mentira: existiria um nível a partir do qual nenhuma tentativa jamais
 * dá certo. Com 1%, subir continua possível para sempre — só caríssimo.
 */
const PISO_SUCESSO = 0.01;

// A queda cresce 2 pontos por nível e para de crescer em 35%.
const QUEDA_POR_NIVEL = 0.02;
const TETO_QUEDA = 0.35;

// Fator de crescimento do custo por nível.
const CUSTO_POR_NIVEL = 0.6;

function normalizar(rarity) {
    const chave = String(rarity || 'common').toLowerCase().trim();
    return BASE_SUCESSO[chave] !== undefined ? chave : 'common';
}

function nivelValido(nivel) {
    return Math.max(0, Math.floor(Number(nivel) || 0));
}

/**
 * As três chances neste nível.
 * @returns {{ sucesso: number, nada: number, queda: number }} somam 1
 */
function chances(rarity, nivel = 0) {
    const r = normalizar(rarity);
    const n = nivelValido(nivel);

    const sucesso = Math.max(PISO_SUCESSO, BASE_SUCESSO[r] * Math.pow(DECAIMENTO, n));
    // Em nível 0 não há o que perder: o overall natural é o chão.
    const queda = n === 0 ? 0 : Math.min(TETO_QUEDA, QUEDA_POR_NIVEL * n);

    return { sucesso, queda, nada: Math.max(0, 1 - sucesso - queda) };
}

/** Quantas gemas custa a próxima tentativa. */
function custoEmGemas(rarity, nivel = 0) {
    const r = normalizar(rarity);
    return Math.max(1, Math.round(CUSTO_BASE[r] * (1 + nivelValido(nivel) * CUSTO_POR_NIVEL)));
}

/**
 * Sorteia o desfecho da tentativa.
 * @returns {'sucesso'|'nada'|'queda'}
 */
function resolver(rarity, nivel = 0, aleatorio = Math.random) {
    const { sucesso, queda } = chances(rarity, nivel);
    const x = aleatorio();
    if (x < sucesso) return 'sucesso';
    if (x < sucesso + queda) return 'queda';
    return 'nada';
}

/**
 * Os valores naturais da carta — de onde todo cálculo parte.
 *
 * Cartas anteriores ao aprimoramento não têm `base` gravado. Nesse caso
 * os valores atuais SÃO os naturais, porque elas nunca subiram: `nivel`
 * ausente é 0.
 */
function baseDaCarta(card) {
    const b = card?.base;
    if (b && Number(b.overall) > 0) {
        return {
            overall: Number(b.overall) || 0,
            ATA: Number(b.ATA) || 0,
            LIF: Number(b.LIF) || 0,
            POW: Number(b.POW) || 0
        };
    }
    return {
        overall: Number(card?.overall) || 0,
        ATA: Number(card?.ATA) || 0,
        LIF: Number(card?.LIF) || 0,
        POW: Number(card?.POW) || 0
    };
}

/**
 * Os atributos de uma carta neste nível.
 *
 * Sempre a partir do natural, nunca do valor já aprimorado — ver o
 * cabeçalho para o porquê.
 */
function statsDoNivel(base, nivel) {
    const n = nivelValido(nivel);
    const overall = base.overall + n;

    // Se o overall natural fosse 0 (carta corrompida), a divisão explodia.
    const fator = base.overall > 0 ? overall / base.overall : 1;

    return {
        overall,
        ATA: Math.max(1, Math.round(base.ATA * fator)),
        LIF: Math.max(1, Math.round(base.LIF * fator)),
        POW: Math.max(1, Math.round(base.POW * fator))
    };
}

/**
 * Como a carta fica depois da tentativa.
 *
 * @param {object} card       a cópia do inventário
 * @param {'sucesso'|'nada'|'queda'} desfecho
 * @param {boolean} protegido o pergaminho segurou a queda
 * @returns {{ nivel, overall, ATA, LIF, POW, marketValue, valueToSell, base }}
 */
function aplicar(card, desfecho, protegido = false) {
    const base = baseDaCarta(card);
    const atual = nivelValido(card?.nivel);

    let nivel = atual;
    if (desfecho === 'sucesso') nivel = atual + 1;
    // `Math.max(0, ...)` é redundante com a queda de 0% no nível 0, e fica
    // de propósito: são duas travas para a regra de que a carta nunca
    // fica pior do que nasceu.
    else if (desfecho === 'queda' && !protegido) nivel = Math.max(0, atual - 1);

    const stats = statsDoNivel(base, nivel);

    // O preço acompanha o overall: `valores.js` continua sendo a única
    // fonte, então a carta aprimorada é precificada pela mesma régua que
    // todas as outras.
    const preco = valores.valoresDaCarta({ rarity: card?.rarity, overall: stats.overall });

    return {
        nivel,
        ...stats,
        marketValue: preco.marketValue,
        valueToSell: preco.valueToSell,
        base
    };
}

/** "+3" para mostrar junto do nome. Vazio no nível 0. */
function selo(nivel) {
    const n = nivelValido(nivel);
    return n > 0 ? `+${n}` : '';
}

module.exports = {
    BASE_SUCESSO,
    CUSTO_BASE,
    DECAIMENTO,
    PISO_SUCESSO,
    QUEDA_POR_NIVEL,
    TETO_QUEDA,
    chances,
    custoEmGemas,
    resolver,
    baseDaCarta,
    statsDoNivel,
    aplicar,
    selo
};
