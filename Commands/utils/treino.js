const Card = require('./cardSchema');

/**
 * Montagem do adversário do modo treino.
 *
 * ## A regra inegociável deste arquivo
 *
 * Treino NÃO VALE NADA. Não dá moeda, não move ELO, não conta para missão,
 * conquista ou estatística, e não consome nem entrega carta nenhuma.
 *
 * Por isso este módulo e o `treinoRun.js` não podem importar `economy`,
 * `elo`, `progresso`, `battleState` nem `userSchema` para escrita. Existe
 * uma verificação em `tests/convencoes.test.js` que falha se alguém
 * plugar contadores aqui — sem ela, é o tipo de coisa que entra sem
 * ninguém perceber e transforma o modo de teste numa fábrica de moeda.
 *
 * A única leitura no banco é o catálogo de cartas, para sortear o time do
 * rival.
 */

const NOME_RIVAL = 'BOT Caviar';

/**
 * Dificuldades.
 *
 * O multiplicador se aplica sobre a média de overall do SEU time, então o
 * treino acompanha a sua coleção: quem tem cartas fracas enfrenta cartas
 * fracas, e continua sendo um teste útil.
 */
const DIFICULDADES = {
    facil: { chave: 'facil', nome: 'Fácil', emoji: '🟢', multiplicador: 0.80 },
    parelho: { chave: 'parelho', nome: 'Parelho', emoji: '🟡', multiplicador: 1.00 },
    dificil: { chave: 'dificil', nome: 'Difícil', emoji: '🔴', multiplicador: 1.20 }
};

const PADRAO = 'parelho';

/** Largura da faixa em volta do alvo, para o rival não sair sempre igual. */
const TOLERANCIA = 0.15;

/** Média de overall de um time. */
function mediaOverall(cartas) {
    if (!cartas || cartas.length === 0) return 0;
    const soma = cartas.reduce((acumulado, c) => acumulado + (c.overall || 0), 0);
    return soma / cartas.length;
}

/**
 * Faixa de overall que o rival deve ter.
 *
 * Devolve `{ min, max, alvo }`. O mínimo nunca desce de 1 nem sobe acima
 * do máximo — sem isso, um time muito fraco no modo fácil geraria uma
 * faixa invertida e a consulta não acharia carta nenhuma.
 */
function faixaDeOverall(mediaDoTime, dificuldade = PADRAO) {
    const config = DIFICULDADES[dificuldade] || DIFICULDADES[PADRAO];
    const alvo = Math.max(1, Math.round(mediaDoTime * config.multiplicador));

    const min = Math.max(1, Math.round(alvo * (1 - TOLERANCIA)));
    const max = Math.max(min + 1, Math.round(alvo * (1 + TOLERANCIA)));

    return { min, max, alvo };
}

/** As três melhores cartas do inventário, que é o time padrão do jogador. */
function melhoresTres(inventario) {
    return [...(inventario || [])]
        .sort((a, b) => (b.overall || 0) - (a.overall || 0))
        .slice(0, 3);
}

/**
 * Sorteia o time do BOT Caviar.
 *
 * Tenta primeiro dentro da faixa; se o catálogo não tiver cartas ali,
 * abre a busca. Um catálogo pequeno não pode impedir o treino de
 * funcionar — é justamente quem está começando que mais usa o modo.
 */
async function montarTimeRival(inventarioDoJogador, dificuldade = PADRAO) {
    const meuTime = melhoresTres(inventarioDoJogador);
    const faixa = faixaDeOverall(mediaOverall(meuTime), dificuldade);

    let cartas = await Card.aggregate([
        { $match: { overall: { $gte: faixa.min, $lte: faixa.max } } },
        { $sample: { size: 3 } }
    ]);

    // Faixa vazia: sorteia de qualquer lugar do catálogo.
    if (cartas.length < 3) {
        cartas = await Card.aggregate([{ $sample: { size: 3 } }]);
    }

    if (cartas.length === 0) return { ok: false, motivo: 'CATALOGO_VAZIO' };

    // Catálogo com menos de 3 cartas: repete para fechar o time.
    const time = Array.from({ length: 3 }, (_, i) => cartas[i % cartas.length]);

    return {
        ok: true,
        meuTime,
        timeRival: time.map((c) => ({
            name: c.name,
            series: c.series,
            rarity: c.rarity,
            overall: c.overall,
            ATA: c.ATA,
            LIF: c.LIF,
            POW: c.POW
        })),
        faixa,
        dificuldade: DIFICULDADES[dificuldade] || DIFICULDADES[PADRAO]
    };
}

module.exports = {
    NOME_RIVAL,
    DIFICULDADES,
    PADRAO,
    TOLERANCIA,
    mediaOverall,
    faixaDeOverall,
    melhoresTres,
    montarTimeRival
};
