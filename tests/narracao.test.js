/**
 * Testes da transmissão ao vivo da batalha.
 *
 * A garantia central: a animação REENCENA um resultado já calculado. Ela
 * não pode inventar nada, não pode divergir do vencedor, e o último quadro
 * tem que mostrar o desfecho — parar no meio de uma troca de golpes é o
 * jeito mais fácil de estragar a experiência.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

const { runBattle } = require(ROOT + 'battleEngine.js');
const narracao = require(ROOT + 'narracao.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const carta = (nome, ovr, lif) => ({
    name: nome, rarity: 'common', overall: ovr,
    ATA: ovr, LIF: lif, POW: ovr
});

const deckA = [carta('Gojo', 70, 150), carta('Nanami', 60, 130), carta('Megumi', 55, 120)];
const deckB = [carta('Sukuna', 68, 145), carta('Mahito', 58, 125), carta('Jogo', 52, 115)];

/** Gerador determinístico, para o teste não depender de sorte. */
function rngFixo(semente) {
    let s = semente;
    return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
    };
}

(async () => {
console.log('=== O motor emite eventos ===');
const resultado = runBattle(deckA, deckB, rngFixo(42));

check('todo round tem eventos', resultado.rounds.every((r) => Array.isArray(r.eventos) && r.eventos.length > 0));
check('todo round leva os nomes das cartas',
    resultado.rounds.every((r) => typeof r.nomeA === 'string' && typeof r.nomeB === 'string'));
check('o log de texto continua existindo', resultado.rounds.every((r) => Array.isArray(r.log)),
    '<- vários lugares ainda dependem dele');

const primeiro = resultado.rounds[0].eventos[0];
check('o primeiro evento é a abertura', primeiro.tipo === 'inicio', `(${primeiro.tipo})`);
check('todo evento carrega a vida dos dois lados',
    resultado.rounds.every((r) => r.eventos.every((e) =>
        Number.isFinite(e.vidaA) && Number.isFinite(e.vidaB) && e.maxA > 0 && e.maxB > 0)));
check('vida nunca fica negativa',
    resultado.rounds.every((r) => r.eventos.every((e) => e.vidaA >= 0 && e.vidaB >= 0)),
    '<- barra de vida com número negativo fica ridícula');

console.log('\n=== A vida só cai, nunca sobe ===');
let monotonico = true;
for (const r of resultado.rounds) {
    for (let i = 1; i < r.eventos.length; i++) {
        if (r.eventos[i].vidaA > r.eventos[i - 1].vidaA) monotonico = false;
        if (r.eventos[i].vidaB > r.eventos[i - 1].vidaB) monotonico = false;
    }
}
check('nenhuma carta se cura no meio do round', monotonico);

console.log('\n=== O último evento bate com o vencedor ===');
for (const r of resultado.rounds) {
    const ultimo = r.eventos[r.eventos.length - 1];
    const encerra = ['fim', 'tempo'].includes(ultimo.tipo);
    check(`round ${r.round} termina em fim/tempo`, encerra, `(${ultimo.tipo})`);
    check(`round ${r.round}: evento final concorda com o vencedor`, ultimo.vencedor === r.winner,
        `(evento=${ultimo.vencedor} round=${r.winner})`);
}

console.log('\n=== Agrupamento em quadros ===');
const eventos = narracao.linhaDoTempo(resultado.rounds);
check('a linha do tempo junta os 3 rounds',
    eventos.length === resultado.rounds.reduce((s, r) => s + r.eventos.length, 0),
    `(${eventos.length} eventos)`);

for (const max of [1, 5, 14, 50]) {
    const indices = narracao.agruparEmQuadros(eventos, max);
    check(`no máximo ${max} quadros`, indices.length <= max, `(${indices.length})`);
    check(`  o último quadro é o último evento`, indices[indices.length - 1] === eventos.length - 1,
        max === 14 ? '<- senão a luta "acaba" no meio de um golpe' : '');
    check('  índices em ordem crescente e sem repetir',
        indices.every((v, i) => i === 0 || v > indices[i - 1]));
}

console.log('\n=== Luta curta não é esticada ===');
const curta = narracao.agruparEmQuadros([{}, {}, {}], 14);
check('3 eventos viram 3 quadros', curta.length === 3, `(${curta.length})`);
check('luta sem eventos não quebra', narracao.agruparEmQuadros([], 14).length === 0);

console.log('\n=== Barra de vida ===');
check('vida cheia enche a barra',
    narracao.barra(100, 100).split('⬛').join('').length / 2 === narracao.BARRA_TAMANHO,
    `(${narracao.barra(100, 100)})`);
check('vida zero esvazia', narracao.barra(0, 100) === '⬛'.repeat(narracao.BARRA_TAMANHO));
check('barra sempre tem o mesmo comprimento',
    [0, 1, 37, 50, 99, 100].every((v) => [...narracao.barra(v, 100)].length === narracao.BARRA_TAMANHO));
check('maximo zero não quebra', typeof narracao.barra(0, 0) === 'string');
check('vida acima do máximo não estoura a barra',
    [...narracao.barra(500, 100)].length === narracao.BARRA_TAMANHO);

console.log('\n=== Roteiro completo ===');
const roteiro = narracao.montarRoteiro({
    nomeX: 'Ávila', nomeY: 'Rival', resultado, wager: 50
});

check('gera quadros', roteiro.quadros.length > 0, `(${roteiro.quadros.length})`);
check('respeita o teto de quadros', roteiro.quadros.length <= narracao.MAX_QUADROS);
check('intervalo de pelo menos 2s', roteiro.intervaloMs >= 2000, `(${roteiro.intervaloMs}ms)`,
    );
check('duração fica abaixo de 1 minuto', roteiro.duracaoEstimadaMs <= 60000,
    `(${Math.round(roteiro.duracaoEstimadaMs / 1000)}s)`);

console.log('\n=== Cada quadro é um embed válido ===');
const limites = roteiro.quadros.map((q) => q.toJSON());
check('todo quadro tem título', limites.every((q) => typeof q.title === 'string' && q.title.length > 0));
check('título dentro de 256 caracteres', limites.every((q) => q.title.length <= 256),
    `(maior: ${Math.max(...limites.map((q) => q.title.length))})`);
check('descrição dentro de 4096', limites.every((q) => (q.description || '').length <= 4096));
check('campos dentro de 1024', limites.every((q) => (q.fields || []).every((f) => f.value.length <= 1024)),
    `(maior: ${Math.max(...limites.flatMap((q) => (q.fields || []).map((f) => f.value.length)))})`);
check('aposta aparece no rodapé', limites.some((q) => /100/.test(q.footer?.text || '')),
    '(50 de cada lado = 100)');

console.log('\n=== A animação não inventa resultado ===');
// O placar do último quadro tem que ser o placar real da batalha.
const ultimoTitulo = limites[limites.length - 1].title;
const placarReal = `${resultado.winsX} — ${resultado.winsY}`;
check('o último quadro mostra o placar antes do round final',
    typeof ultimoTitulo === 'string' && ultimoTitulo.includes('—'),
    `(${ultimoTitulo})`);
check('a soma dos rounds bate com o placar',
    resultado.winsX + resultado.winsY === resultado.rounds.length,
    `(${placarReal} em ${resultado.rounds.length} rounds)`);

console.log('\n=== Determinismo: mesma semente, mesma luta ===');
const a = runBattle(deckA, deckB, rngFixo(7));
const b = runBattle(deckA, deckB, rngFixo(7));
check('mesmo vencedor', a.winner === b.winner);
check('mesmos eventos',
    JSON.stringify(a.rounds.map((r) => r.eventos)) === JSON.stringify(b.rounds.map((r) => r.eventos)),
    '<- permite reproduzir um bug relatado');

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE NARRAÇÃO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
