/**
 * Testes das regras de cancelamento e expiração.
 *
 * O bug que originou este arquivo: um convite de troca não aceito
 * bloqueava o jogador por 10 minutos, porque o prazo era único e contado
 * da criação. `temTrocaAtiva` considera 'aguardando' ocupado, e nada
 * tirava a troca dali antes do prazo — o Lucas teve que apagar o registro
 * no banco na mão para conseguir negociar de novo.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

const ciclo = require(ROOT + 'cicloDeVida.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const MIN = 60 * 1000;
const atras = (minutos) => new Date(Date.now() - minutos * MIN);

(async () => {
console.log('=== Prazos por fase da troca ===');
const { PRAZOS_TROCA: T, PRAZOS_BATALHA: B, expirou } = ciclo;

check('convite não aceito morre em 2 min', T.aguardando === 2 * MIN, `(${T.aguardando / MIN}min)`);
check('negociação tem 5 min', T.montando === 5 * MIN);
check('execução travada morre em 1 min', T.executando === 1 * MIN);
check('execução expira antes de tudo', T.executando < T.aguardando && T.executando < T.montando);
check('estados finais não têm prazo', T.concluida === undefined && T.cancelada === undefined,
    '<- varrer estado final apagaria histórico');

console.log('\n=== Convite preso: o bug relatado ===');
check('convite de 1 min ainda vale', expirou('aguardando', atras(1), T) === false);
check('convite de 3 min já morreu', expirou('aguardando', atras(3), T) === true,
    '<- antes ele segurava o jogador por 10 min');
// A regressão a evitar: alguém voltar para um prazo único de 10 minutos.
check('convite de 3 min NÃO sobreviveria a um prazo único de 10 min',
    expirou('aguardando', atras(3), { aguardando: 10 * MIN }) === false,
    '(demonstra o comportamento antigo)');

console.log('\n=== Cada fase respeita o próprio prazo ===');
check('negociação de 3 min continua viva', expirou('montando', atras(3), T) === false);
check('negociação de 6 min morreu', expirou('montando', atras(6), T) === true);
check('execução de 30s continua', expirou('executando', new Date(Date.now() - 30000), T) === false);
check('execução de 2 min morreu', expirou('executando', atras(2), T) === true);

console.log('\n=== Fase desconhecida nunca é apagada ===');
check('fase inexistente não expira', expirou('inventada', atras(999), T) === false,
    '<- errar deixando viva é melhor que apagar por engano');
check('sem data não expira', expirou('aguardando', null, T) === false);
check('concluída não expira nunca', expirou('concluida', atras(9999), T) === false);

console.log('\n=== Quem pode cancelar uma troca ===');
const troca = (fase) => ({ fase, proponente: { id: 'a' }, alvo: { id: 'b' } });

check('proponente cancela durante o convite', ciclo.podeCancelarTroca(troca('aguardando'), 'a').ok === true);
check('alvo cancela durante o convite', ciclo.podeCancelarTroca(troca('aguardando'), 'b').ok === true);
check('quem monta a oferta pode cancelar', ciclo.podeCancelarTroca(troca('montando'), 'a').ok === true);
check('esperando confirmação ainda dá', ciclo.podeCancelarTroca(troca('confirmando'), 'b').ok === true);

const estranho = ciclo.podeCancelarTroca(troca('montando'), 'z');
check('quem não participa não cancela', estranho.ok === false && estranho.motivo === 'NAO_PARTICIPA');

const executando = ciclo.podeCancelarTroca(troca('executando'), 'a');
check('durante a execução NÃO cancela', executando.ok === false && executando.motivo === 'EXECUTANDO',
    '<- as cartas já estão mudando de dono');

const concluida = ciclo.podeCancelarTroca(troca('concluida'), 'a');
check('troca concluída NÃO cancela', concluida.ok === false && concluida.motivo === 'FINALIZADA');
check('troca inexistente não quebra', ciclo.podeCancelarTroca(null, 'a').ok === false);

console.log('\n=== Quem pode cancelar uma batalha ===');
const duelo = (phase) => ({ phase, userX: { id: 'a' }, userY: { id: 'b' } });

check('escolhendo cartas dá para cancelar', ciclo.podeCancelarBatalha(duelo('choosing'), 'a').ok === true);
check('o desafiado também cancela', ciclo.podeCancelarBatalha(duelo('choosing'), 'b').ok === true);

const lutando = ciclo.podeCancelarBatalha(duelo('fighting'), 'a');
check('em combate NÃO cancela', lutando.ok === false && lutando.motivo === 'EM_COMBATE',
    '<- cancelar aí seria desfazer uma derrota');

const forasteiro = ciclo.podeCancelarBatalha(duelo('choosing'), 'z');
check('quem não é dos dois não cancela', forasteiro.ok === false && forasteiro.motivo === 'NAO_PARTICIPA');

console.log('\n=== Todo motivo tem mensagem para o jogador ===');
const motivos = ['NAO_PARTICIPA', 'EXECUTANDO', 'EM_COMBATE', 'FINALIZADA'];
for (const m of motivos) {
    check(`mensagem para ${m}`, typeof ciclo.MENSAGENS[m] === 'string' && ciclo.MENSAGENS[m].length > 10);
}

console.log('\n=== Filtro do Mongo ===');
const filtro = ciclo.filtroExpirados(T, 'fase', 'criadaEm');
check('gera um $or com uma condição por fase', filtro.$or.length === Object.keys(T).length,
    `(${filtro.$or.length} condições)`);
check('cada condição casa fase e data',
    filtro.$or.every((c) => typeof c.fase === 'string' && c.criadaEm.$lt instanceof Date));

const cond = filtro.$or.find((c) => c.fase === 'executando');
const condConvite = filtro.$or.find((c) => c.fase === 'aguardando');
check('a fase de prazo menor tem o corte mais recente',
    cond.criadaEm.$lt > condConvite.criadaEm.$lt,
    '<- executando (1min) corta depois de aguardando (2min)');

check('estados finais ficam fora do filtro',
    !filtro.$or.some((c) => ['concluida', 'cancelada'].includes(c.fase)));

// A batalha usa `phase` em inglês; o filtro precisa acompanhar.
const filtroB = ciclo.filtroExpirados(B, 'phase', 'createdAt');
check('filtro da batalha usa phase/createdAt',
    filtroB.$or.every((c) => 'phase' in c && 'createdAt' in c));

console.log('\n=== Tempo restante (para mostrar ao jogador) ===');
check('convite novo tem quase 2 min', ciclo.tempoRestante('aguardando', atras(0), T) > 1.9 * MIN);
check('convite vencido devolve zero', ciclo.tempoRestante('aguardando', atras(5), T) === 0);
check('fase sem prazo devolve zero', ciclo.tempoRestante('concluida', atras(1), T) === 0);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE CICLO DE VIDA PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
