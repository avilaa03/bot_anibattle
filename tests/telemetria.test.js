/**
 * Testes da telemetria do /roll.
 *
 * O que precisa valer sempre:
 *
 * - Um jogador HUMANO não pode receber score alto. Falso positivo aqui é
 *   o erro caro: banir quem joga direito é irreversível na prática,
 *   porque a pessoa não volta.
 * - Um macro óbvio (sempre pontual, sem dormir, clique instantâneo)
 *   precisa aparecer no topo.
 * - Quem tem poucas amostras NÃO recebe score. Sem isso, um jogador novo
 *   com três rolls lidera a lista de suspeitos.
 * - O silêncio é medido de forma CIRCULAR. Quem dorme das 23h às 6h tem o
 *   buraco partido entre o fim e o começo do vetor de horas.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

// A telemetria escreve no banco; para testar os cálculos, o schema é
// substituído por um duplo que não conecta em nada.
require.cache[require.resolve(ROOT + 'userSchema.js')] = {
    exports: { updateOne: async () => ({ acknowledged: true }) }
};

const telemetria = require(ROOT + 'telemetria.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

/**
 * Monta os agregados como o banco os teria depois de N rolls.
 * @param {number[]} atrasosMs
 * @param {number[]} horasAtivas horas UTC em que houve atividade
 */
function usuario(atrasosMs, horasAtivas, cliques = []) {
    const porHora = {};
    for (const h of horasAtivas) porHora[String(h)] = (porHora[String(h)] || 0) + 1;

    const soma = atrasosMs.reduce((a, b) => a + b, 0);
    // Em segundos ao quadrado, igual ao que registrarRoll grava.
    const somaQuadrados = atrasosMs.reduce((a, b) => a + (b / 1000) ** 2, 0);

    return {
        telemetria: {
            totalRolls: atrasosMs.length,
            porHora,
            pontualidade: {
                amostras: atrasosMs.length,
                pontuais: atrasosMs.filter((a) => a < telemetria.LIMIAR_PONTUAL_MS).length,
                somaAtraso: soma,
                somaQuadrados
            },
            cliques: {
                amostras: cliques.length,
                soma: cliques.reduce((a, b) => a + b, 0),
                rapidos: cliques.filter((c) => c < telemetria.LIMIAR_CLIQUE_MS).length
            },
            ultimosRolls: []
        }
    };
}

const todasAsHoras = Array.from({ length: 24 }, (_, i) => i);
const horasDeGente = [8, 9, 12, 13, 14, 18, 19, 20, 21, 22];

console.log('=== Silêncio é medido de forma circular ===');
// Quem dorme das 23h às 6h tem o buraco partido entre o fim e o começo do
// vetor. Uma leitura linear veria dois buracos pequenos, não um grande.
const dormeVirandoODia = new Array(24).fill(1);
for (const h of [23, 0, 1, 2, 3, 4, 5]) dormeVirandoODia[h] = 0;
check('sono que atravessa a meia-noite conta como um bloco só',
    telemetria.maiorSilencio(dormeVirandoODia) === 7,
    `(${telemetria.maiorSilencio(dormeVirandoODia)}h)`);

const semSono = new Array(24).fill(3);
check('atividade em todas as horas -> silêncio 0', telemetria.maiorSilencio(semSono) === 0);

const soUmaHora = new Array(24).fill(0);
soUmaHora[10] = 5;
check('atividade em uma hora só -> silêncio 23', telemetria.maiorSilencio(soUmaHora) === 23);
check('vetor todo zerado -> silêncio 24', telemetria.maiorSilencio(new Array(24).fill(0)) === 24);

console.log('\n=== Leitura do histograma ===');
check('aceita Map (documento vivo)',
    telemetria.normalizarHoras(new Map([['3', 7]]))[3] === 7);
check('aceita objeto (consulta lean)',
    telemetria.normalizarHoras({ 3: 7 })[3] === 7);
check('ausente devolve 24 zeros',
    telemetria.normalizarHoras(null).length === 24
    && telemetria.normalizarHoras(null).every((n) => n === 0));

console.log('\n=== Poucas amostras NÃO recebem score ===');
// Sem esta trava, um jogador novo com 3 rolls lideraria a fila.
const novato = usuario([1000, 1200, 900], [14, 15, 16]);
check('novato com 3 rolls tem score nulo', telemetria.resumo(novato).score === null,
    `(${telemetria.resumo(novato).score})`);

console.log('\n=== O humano não pode ser acusado ===');
// Atrasos irregulares, de segundos a horas, e 14 h sem atividade por dia.
const atrasosHumanos = [
    45_000, 320_000, 12_000, 1_800_000, 95_000, 600_000, 30_000, 240_000,
    3_600_000, 8_000, 150_000, 900_000, 60_000, 420_000, 20_000, 1_200_000,
    75_000, 500_000, 180_000, 40_000, 2_400_000, 110_000, 55_000, 700_000
];
const humano = usuario(atrasosHumanos, horasDeGente, [2400, 3100, 1800, 4500, 2900]);
const rHumano = telemetria.resumo(humano);

check('humano recebe score baixo', rHumano.score !== null && rHumano.score < 30,
    `(score ${rHumano.score})`);
check('e o sono dele é detectado', rHumano.maiorSilencioHoras >= 6,
    `(${rHumano.maiorSilencioHoras}h de silêncio)`);
check('taxa de pontualidade baixa', rHumano.taxaPontual < 0.2,
    `(${(rHumano.taxaPontual * 100).toFixed(0)}%)`);

console.log('\n=== O macro óbvio aparece no topo ===');
// Sempre em cima do fim do cooldown, 24 h por dia, clique instantâneo.
const atrasosMacro = Array.from({ length: 40 }, (_, i) => 800 + (i % 5) * 60);
const macro = usuario(atrasosMacro, todasAsHoras, Array(20).fill(180));
const rMacro = telemetria.resumo(macro);

check('macro recebe score alto', rMacro.score >= 85, `(score ${rMacro.score})`);
check('pontualidade quase total', rMacro.taxaPontual > 0.95,
    `(${(rMacro.taxaPontual * 100).toFixed(0)}%)`);
check('desvio-padrão de milissegundos', rMacro.desvioMs < 1000,
    `(${rMacro.desvioMs.toFixed(0)}ms)`);
check('não dorme', rMacro.maiorSilencioHoras === 0);

check('e o macro pontua MUITO acima do humano',
    rMacro.score - rHumano.score >= 50,
    `(${rHumano.score} vs ${rMacro.score})`);

console.log('\n=== Casos que não podem virar falso positivo ===');
// Quem trabalha de madrugada tem sono deslocado — mas tem sono.
const horasInvertidas = [0, 1, 2, 3, 4, 5, 6, 22, 23];
const notturno = usuario(atrasosHumanos, horasInvertidas, [2200, 3000, 1900]);
check('jogador noturno não é acusado', telemetria.resumo(notturno).score < 30,
    `(score ${telemetria.resumo(notturno).score})`);

// Jogador dedicado: pontual várias vezes, mas com variação real e sono.
const dedicado = usuario(
    [3000, 4000, 2000, 250_000, 60_000, 3500, 900_000, 4500, 120_000, 2500,
     400_000, 3000, 80_000, 4000, 1_500_000, 2000, 30_000, 3500, 200_000, 4000,
     50_000, 3000, 600_000, 2500],
    horasDeGente
);
const rDedicado = telemetria.resumo(dedicado);
check('jogador dedicado fica abaixo do macro', rDedicado.score < rMacro.score,
    `(${rDedicado.score} vs ${rMacro.score})`);
check('e o sono dele o protege', rDedicado.maiorSilencioHoras >= 6);

console.log('\n=== Estatística sai correta ===');
const preciso = usuario([1000, 2000, 3000, 4000, 5000], horasDeGente);
const rPreciso = telemetria.resumo(preciso);
check('média do atraso', rPreciso.mediaAtrasoMs === 3000, `(${rPreciso.mediaAtrasoMs})`);
// Desvio populacional de [1,2,3,4,5] segundos = sqrt(2) s.
check('desvio-padrão', Math.abs(rPreciso.desvioMs - Math.sqrt(2) * 1000) < 1,
    `(${rPreciso.desvioMs.toFixed(0)}ms, esperado ${(Math.sqrt(2) * 1000).toFixed(0)}ms)`);

console.log('\n=== Sem telemetria nenhuma não quebra ===');
const vazio = telemetria.resumo({});
check('usuário sem dados devolve resumo utilizável',
    vazio.score === null && vazio.totalRolls === 0 && vazio.horas.length === 24);
check('usuário nulo não quebra', telemetria.resumo(null).totalRolls === 0);

console.log('\n=== A gravação é tolerante ===');
(async () => {
    check('primeiro roll (sem cooldown anterior) não quebra',
        await telemetria.registrarRoll('u1', { agora: Date.now(), prontoEm: null }) !== undefined);
    check('roll com atraso normal não quebra',
        await telemetria.registrarRoll('u1', { agora: Date.now(), prontoEm: Date.now() - 60000 }) !== undefined);
    check('clique inválido é ignorado', await telemetria.registrarClique('u1', NaN) === null);
    check('clique negativo é ignorado', await telemetria.registrarClique('u1', -5) === null);
    check('clique válido é aceito', await telemetria.registrarClique('u1', 2500) !== null);

    console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE TELEMETRIA PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
    process.exit(falhas ? 1 : 0);
})();
