const User = require('./userSchema');

/**
 * Telemetria de comportamento do /roll.
 *
 * ## Por que existe, e por que AGORA
 *
 * O banco guarda só `lastRoll` — o instante do último roll. O anterior é
 * sobrescrito e some para sempre. Qualquer detecção de macro depende de
 * HISTÓRICO, e histórico não se recupera: começar a gravar hoje custa um
 * campo; começar daqui a três meses custa três meses de dados que nunca
 * vão existir, justamente do período em que os scripts mais atuaram.
 *
 * ## Este arquivo NÃO pune ninguém
 *
 * Ele só mede. Nada aqui bloqueia comando, aumenta cooldown ou aplica
 * banimento — a decisão continua humana, com os dados na tela. Falso
 * positivo em detecção automática custa mais caro que tolerar um script
 * por mais um mês: banir um jogador legítimo é irreversível na prática,
 * porque ele não volta.
 *
 * ## O que um macro realmente ganha
 *
 * O cooldown é validado no servidor contra o banco (`rollRun.js`), então
 * NENHUM script rola mais rápido que o permitido. O que ele ganha é nunca
 * perder um roll: ~96 por dia contra os ~25 de quem dorme e trabalha. É
 * vantagem econômica, não técnica.
 *
 * ## Os sinais
 *
 * - **Pontualidade.** Humano rola minutos depois do cooldown vencer, e
 *   varia muito. Script rola em menos de 5 s, sempre. O desvio-padrão
 *   sozinho já separa quase tudo: gente não tem desvio de milissegundos.
 * - **Ausência de sono.** Todo humano tem 6–8 h sem atividade por dia.
 *   Um histograma de 24 posições mostra isso na hora.
 * - **Latência do clique.** Entre a carta aparecer e o botão ser clicado,
 *   humano leva 1–5 s; macro, uns 200 ms.
 *
 * ## Por que o armazenamento é agregado
 *
 * Guardar cada roll seria ~35 mil registros por jogador por ano. Em vez
 * disso guardamos somas e contagens — que bastam para média e
 * desvio-padrão — mais uma janela curta dos últimos rolls, limitada pelo
 * próprio Mongo com `$slice`, para conseguir olhar caso a caso no painel.
 */

/** Abaixo disso, o roll é "pontual demais" para ser humano. */
const LIMIAR_PONTUAL_MS = 5 * 1000;

/** Abaixo disso, o clique no botão é rápido demais para ser humano. */
const LIMIAR_CLIQUE_MS = 400;

/** Quantos rolls recentes ficam guardados por jogador. */
const JANELA = 50;

/**
 * Teto do atraso considerado na média.
 *
 * Sem isto, um jogador que ficou uma semana fora entraria com 600 milhões
 * de milissegundos e sozinho destruiria a média e o desvio de todo o
 * histórico dele. O sinal que interessa está no piso, não no teto.
 */
const TETO_ATRASO_MS = 60 * 60 * 1000;

/** Amostras mínimas para o score significar alguma coisa. */
const AMOSTRAS_MINIMAS = 20;

/**
 * Registra um roll.
 *
 * Uma escrita atômica só, com `$inc` nos agregados e `$push`/`$slice` na
 * janela. Nunca pode atrasar nem derrubar o /roll — quem chama dispara
 * sem await e com catch.
 *
 * @param {string} userId
 * @param {object} dados
 * @param {number} dados.agora     timestamp do roll
 * @param {number|null} dados.prontoEm  quando o cooldown venceu (null no 1º roll)
 */
async function registrarRoll(userId, { agora = Date.now(), prontoEm = null } = {}) {
    const hora = new Date(agora).getUTCHours();

    const incrementos = {
        'telemetria.totalRolls': 1,
        [`telemetria.porHora.${hora}`]: 1
    };

    const operacoes = { $inc: incrementos };

    // O primeiro roll de um jogador não tem cooldown anterior, então não
    // há atraso a medir. Medir zero ali contaria como "pontualíssimo" e
    // acusaria todo mundo no primeiro uso.
    if (prontoEm) {
        const atraso = Math.min(TETO_ATRASO_MS, Math.max(0, agora - prontoEm));

        incrementos['telemetria.pontualidade.amostras'] = 1;
        incrementos['telemetria.pontualidade.somaAtraso'] = atraso;
        // Guardado em segundos ao quadrado: em milissegundos, alguns
        // milhares de amostras estouram a precisão do double do JS.
        incrementos['telemetria.pontualidade.somaQuadrados'] = (atraso / 1000) ** 2;
        if (atraso < LIMIAR_PONTUAL_MS) incrementos['telemetria.pontualidade.pontuais'] = 1;

        operacoes.$push = {
            'telemetria.ultimosRolls': {
                $each: [{ em: new Date(agora), atrasoMs: atraso }],
                $slice: -JANELA
            }
        };
    }

    return User.updateOne({ id: userId }, operacoes, { upsert: true });
}

/**
 * Registra quanto tempo o jogador levou para clicar no botão do /roll.
 * @param {number} latenciaMs
 */
async function registrarClique(userId, latenciaMs) {
    const latencia = Number(latenciaMs);
    if (!Number.isFinite(latencia) || latencia < 0) return null;

    const incrementos = {
        'telemetria.cliques.amostras': 1,
        'telemetria.cliques.soma': Math.min(latencia, 60 * 1000)
    };
    if (latencia < LIMIAR_CLIQUE_MS) incrementos['telemetria.cliques.rapidos'] = 1;

    return User.updateOne({ id: userId }, { $inc: incrementos });
}

/** O histograma vem como Map (documento vivo) ou objeto (lean). */
function normalizarHoras(porHora) {
    const horas = new Array(24).fill(0);
    if (!porHora) return horas;

    const ler = porHora instanceof Map
        ? (h) => porHora.get(String(h))
        : (h) => porHora[String(h)];

    for (let h = 0; h < 24; h++) horas[h] = Number(ler(h)) || 0;
    return horas;
}

/**
 * A maior sequência de horas seguidas sem nenhum roll.
 *
 * Circular de propósito: quem dorme das 23h às 6h tem o silêncio partido
 * entre o fim e o começo do vetor, e uma leitura linear enxergaria dois
 * buracos pequenos em vez de um grande.
 */
function maiorSilencio(horas) {
    if (horas.every((n) => n === 0)) return 24;
    if (horas.every((n) => n > 0)) return 0;

    let maior = 0;
    let atual = 0;
    for (let i = 0; i < 48; i++) {
        if (horas[i % 24] === 0) {
            atual++;
            maior = Math.max(maior, atual);
        } else {
            atual = 0;
        }
    }
    return Math.min(24, maior);
}

/**
 * Números legíveis a partir dos agregados.
 *
 * `score` é null enquanto não houver amostras suficientes — sem isso, um
 * jogador novo com três rolls apareceria no topo da lista de suspeitos.
 */
function resumo(user) {
    const t = user?.telemetria || {};
    const p = t.pontualidade || {};
    const c = t.cliques || {};

    const amostras = Number(p.amostras) || 0;
    const mediaAtrasoMs = amostras > 0 ? (Number(p.somaAtraso) || 0) / amostras : null;
    const taxaPontual = amostras > 0 ? (Number(p.pontuais) || 0) / amostras : 0;

    // Desvio-padrão populacional, a partir das somas. `somaQuadrados` está
    // em segundos², então a média entra em segundos para bater a unidade.
    let desvioMs = null;
    if (amostras > 1) {
        const mediaSeg = mediaAtrasoMs / 1000;
        const variancia = Math.max(0, (Number(p.somaQuadrados) || 0) / amostras - mediaSeg ** 2);
        desvioMs = Math.sqrt(variancia) * 1000;
    }

    const horas = normalizarHoras(t.porHora);
    const horasAtivas = horas.filter((n) => n > 0).length;
    const silencio = maiorSilencio(horas);

    const cliques = Number(c.amostras) || 0;
    const mediaCliqueMs = cliques > 0 ? (Number(c.soma) || 0) / cliques : null;
    const taxaCliqueRapido = cliques > 0 ? (Number(c.rapidos) || 0) / cliques : 0;

    return {
        totalRolls: Number(t.totalRolls) || 0,
        amostras,
        mediaAtrasoMs,
        desvioMs,
        taxaPontual,
        horas,
        horasAtivas,
        maiorSilencioHoras: silencio,
        cliques,
        mediaCliqueMs,
        taxaCliqueRapido,
        score: amostras >= AMOSTRAS_MINIMAS ? pontuar({ taxaPontual, desvioMs, silencio, taxaCliqueRapido, cliques }) : null
    };
}

/**
 * Suspeita de 0 a 100.
 *
 * Não é veredito: é ordenação para a fila de revisão manual. Nenhum sinal
 * sozinho condena — jogador dedicado pode ser pontual, e quem trabalha de
 * madrugada pode ter sono deslocado. O que denuncia é a soma.
 */
function pontuar({ taxaPontual, desvioMs, silencio, taxaCliqueRapido, cliques }) {
    let score = 0;

    // Rolar quase sempre em cima do fim do cooldown é o sinal mais forte.
    score += Math.min(40, taxaPontual * 40);

    // Regularidade sobre-humana: desvio menor que 30 s é quase impossível
    // para quem abre o Discord na mão.
    if (desvioMs !== null) {
        if (desvioMs < 5000) score += 25;
        else if (desvioMs < 30000) score += 15;
        else if (desvioMs < 120000) score += 5;
    }

    // Todo mundo dorme. Menos de 3 h de silêncio no dia é bandeira.
    if (silencio <= 1) score += 25;
    else if (silencio <= 3) score += 15;
    else if (silencio <= 5) score += 5;

    if (cliques >= 10) score += Math.min(10, taxaCliqueRapido * 10);

    return Math.round(Math.min(100, score));
}

module.exports = {
    LIMIAR_PONTUAL_MS,
    LIMIAR_CLIQUE_MS,
    JANELA,
    TETO_ATRASO_MS,
    AMOSTRAS_MINIMAS,
    registrarRoll,
    registrarClique,
    normalizarHoras,
    maiorSilencio,
    resumo,
    pontuar
};
