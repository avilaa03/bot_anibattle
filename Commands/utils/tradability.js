/**
 * Pode negociar esta carta? Pode desmanchar?
 *
 * ## Por que num arquivo só
 *
 * A regra precisa valer em SEIS lugares — mercado, venda rápida, troca,
 * transferência, desmanche e o painel. Se cada um perguntasse do seu
 * jeito, bastaria esquecer de um para a carta vinculada virar
 * negociável por ali. E o caminho esquecido não daria erro: ele
 * simplesmente funcionaria.
 *
 * Há um teste em `tests/convencoes.test.js` que falha se algum comando de
 * troca ou venda deixar de consultar este módulo.
 *
 * ## A negociabilidade fica CONGELADA na cópia
 *
 * O catálogo tem `comercializavel`, mas quem manda é o campo copiado para
 * o inventário no momento da entrega. Se você marcar uma carta como
 * vinculada depois de já ter distribuído, quem recebeu antes continua
 * podendo vender — ninguém perde o direito de negociar algo que ganhou
 * sob outra regra.
 *
 * Cartas anteriores a esta mudança não têm o campo, e ausência significa
 * **negociável**: elas sempre foram.
 */

/** A raridade das cartas de evento. */
const { traduzir, DEFAULT_LOCALE } = require('./i18n');

const RARIDADE_EVENTO = 'event';

function raridadeDe(carta) {
    return String(carta?.rarity ?? '').toLowerCase().trim();
}

/** A carta é de evento? */
function ehDeEvento(carta) {
    return raridadeDe(carta) === RARIDADE_EVENTO;
}

/**
 * A carta pode trocar de mãos (mercado, venda rápida, troca, transferência)?
 *
 * `undefined` conta como `true`: é o caso de todo o acervo anterior a esta
 * mudança.
 */
function podeNegociar(carta) {
    return carta?.comercializavel !== false;
}

/**
 * A carta pode ser desmanchada?
 *
 * Carta de evento NÃO pode, mesmo sendo negociável. Ela não pode ser
 * obtida de novo depois que a distribuição fecha, e desmanchar é
 * irreversível — é o único lugar do jogo onde um clique apaga algo
 * insubstituível. Vender pelo menos passa a carta para outra pessoa.
 */
function podeDesmanchar(carta) {
    return podeNegociar(carta) && !ehDeEvento(carta);
}

/** Explicação para o jogador, quando a ação é recusada. */
function motivoDeRecusa(carta, acao = 'negociar', locale = DEFAULT_LOCALE) {
    if (ehDeEvento(carta) && acao === 'desmanchar') {
        return traduzir(locale, 'negociabilidade.evento_nao_desmancha');
    }
    if (!podeNegociar(carta)) {
        return traduzir(locale, 'negociabilidade.vinculada');
    }
    return null;
}

/** Selo para mostrar junto do nome nas listagens. */
function selo(carta) {
    if (!podeNegociar(carta)) return '🔒';
    return '';
}

module.exports = {
    RARIDADE_EVENTO,
    ehDeEvento,
    podeNegociar,
    podeDesmanchar,
    motivoDeRecusa,
    selo
};
