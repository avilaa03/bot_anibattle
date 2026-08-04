/**
 * Testes do valor das cartas.
 *
 * O bug que motivou tudo isto, medido no jogo:
 *
 *   10 Comuns de overall 30  ->  1.500 moedas de venda rápida
 *   1 Mestra de overall 90   ->    900 moedas de valor CHEIO
 *
 * Dez cartas do fundo do balde valiam mais que a carta mais rara do jogo,
 * porque a fórmula era `overall * 10` e a raridade não entrava na conta.
 *
 * O que precisa valer sempre:
 *
 * - A raridade domina o preço. Uma Comum perfeita nunca vale mais que uma
 *   Mestra ruim.
 * - A venda rápida paga proporcionalmente MENOS conforme a raridade sobe.
 *   Ela cria moeda do nada; carta rara tem que ir para o mercado de
 *   jogadores, onde a moeda troca de mãos e ainda paga taxa.
 * - NENHUM arquivo reconstrói o overall dividindo o valor por 10. Essa
 *   conta só valia sob a fórmula antiga e hoje devolveria lixo em
 *   silêncio.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ROOT = path.join(RAIZ, 'Commands', 'utils') + path.sep;

const valores = require(ROOT + 'valores.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const carta = (rarity, overall) => ({ rarity, overall });
const brl = (n) => Number(n).toLocaleString('pt-BR');

const RARIDADES = ['common', 'rare', 'ultra rare', 'legendary', 'master'];

console.log('=== O bug original não pode voltar ===');
//
// É este o teste que dá nome ao arquivo. Se alguém mexer nos valores base
// e reaproximar as faixas, ele quebra.
const dezComuns = valores.valorDeVenda('common', 30) * 10;
const umaMestra = valores.valorDeMercado('master', 90);

check('10 Comuns OVR 30 valem MENOS que uma Mestra OVR 90',
    dezComuns < umaMestra,
    `(${brl(dezComuns)} vs ${brl(umaMestra)})`);

check('e a diferença é de pelo menos 50x',
    umaMestra / dezComuns >= 50,
    `(${(umaMestra / dezComuns).toFixed(0)}x)`);

console.log('\n=== A raridade domina o overall ===');
// Uma Comum perfeita contra uma Mestra sofrível: a hierarquia entre
// raridades não pode ser furada pelo atributo.
for (let i = 0; i < RARIDADES.length - 1; i++) {
    const melhorDaFaixaBaixa = valores.valorDeMercado(RARIDADES[i], 100);
    const piorDaFaixaAlta = valores.valorDeMercado(RARIDADES[i + 1], 1);
    check(`${RARIDADES[i]} OVR 100 < ${RARIDADES[i + 1]} OVR 1`,
        melhorDaFaixaBaixa < piorDaFaixaAlta,
        `(${brl(melhorDaFaixaBaixa)} vs ${brl(piorDaFaixaAlta)})`);
}

console.log('\n=== O overall ainda importa dentro da faixa ===');
for (const r of RARIDADES) {
    const fraca = valores.valorDeMercado(r, 20);
    const forte = valores.valorDeMercado(r, 95);
    check(`${r}: OVR 95 vale mais que OVR 20`, forte > fraca,
        `(${brl(fraca)} -> ${brl(forte)})`);
}

console.log('\n=== A venda rápida aperta conforme a raridade sobe ===');
// A venda rápida imprime moeda. Quanto mais rara a carta, menos ela deve
// pagar — para empurrar a carta boa ao mercado de jogadores.
const percentuais = RARIDADES.map((r) => valores.valorDeVenda(r, 50) / valores.valorDeMercado(r, 50));
for (let i = 0; i < percentuais.length - 1; i++) {
    check(`${RARIDADES[i]} paga % maior que ${RARIDADES[i + 1]}`,
        percentuais[i] > percentuais[i + 1],
        `(${(percentuais[i] * 100).toFixed(0)}% vs ${(percentuais[i + 1] * 100).toFixed(0)}%)`);
}
check('nenhuma venda rápida paga o valor cheio',
    percentuais.every((p) => p < 1));

console.log('\n=== Entradas estranhas não quebram ===');
check('raridade desconhecida cai em comum',
    valores.valorDeMercado('inventada', 50) === valores.valorDeMercado('common', 50));
check('raridade nula não quebra', valores.valorDeMercado(null, 50) > 0);
check('overall nulo não quebra', valores.valorDeMercado('rare', null) > 0);
check('overall negativo não vira valor negativo', valores.valorDeMercado('rare', -50) > 0);
check('valor nunca é zero', RARIDADES.every((r) => valores.valorDeMercado(r, 0) >= 1));
check('MAIÚSCULA na raridade é aceita',
    valores.valorDeMercado('MASTER', 50) === valores.valorDeMercado('master', 50));

console.log('\n=== Leitura do overall ===');
check('lê o campo overall', valores.overallDaCarta(carta('rare', 77)) === 77);
check('aceita o campo legado "ovr"', valores.overallDaCarta({ rarity: 'rare', ovr: 64 }) === 64);
check('carta nula devolve 0', valores.overallDaCarta(null) === 0);
check('NÃO reconstrói pelo valor de mercado',
    valores.overallDaCarta({ rarity: 'master', marketValue: 190500 }) === 0,
    '<- 19.050 seria o bug');

console.log('\n=== A recuperação legada é só para a migração ===');
// Sob a fórmula ANTIGA (overall * 10), dividir por 10 devolvia o overall
// certo. É a única janela em que isso vale.
check('overallLegado recupera pela fórmula antiga',
    valores.overallLegado({ marketValue: 300 }) === 30);
check('mas prefere o campo direto quando existe',
    valores.overallLegado({ overall: 42, marketValue: 999 }) === 42);

console.log('\n=== valoresDaCarta devolve tudo junto ===');
const pacote = valores.valoresDaCarta(carta('legendary', 88));
check('traz mercado, venda, overall e raridade',
    pacote.marketValue > 0 && pacote.valueToSell > 0
    && pacote.overall === 88 && pacote.rarity === 'legendary');
check('venda rápida é menor que o valor de mercado',
    pacote.valueToSell < pacote.marketValue,
    `(${brl(pacote.valueToSell)} vs ${brl(pacote.marketValue)})`);

// ---------------------------------------------------------------------
console.log('\n=== NENHUM COMANDO RECONSTRÓI O OVERALL PELO VALOR ===');
//
// Doze arquivos faziam `Math.round(marketValue / 10)` como fallback. Isso
// funcionava enquanto o valor era literalmente `overall * 10`. Com a
// raridade na fórmula, a mesma conta devolve lixo — uma Mestra de 95
// viraria "overall 19.050" — e o pior é que não quebra nada
// visivelmente: só mostra número errado na ficha, no inventário, no
// mercado e na escolha de time da batalha.
//
// `valores.js` é o único lugar onde a conta pode aparecer, porque é lá
// que ela vive isolada, em `overallLegado()`, com nome que denuncia o uso.

const IGNORAR = new Set(['node_modules', '.git', '.next', 'preview', 'tests', 'scripts']);

function listarArquivos(dir, acumulado = []) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORAR.has(entrada.name)) continue;
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) listarArquivos(completo, acumulado);
        else if (entrada.name.endsWith('.js')) acumulado.push(completo);
    }
    return acumulado;
}

/** Tira comentários: eles citam a fórmula proibida ao explicá-la. */
function semComentarios(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const PERMITIDO = path.join(RAIZ, 'Commands', 'utils', 'valores.js');
const suspeitos = [];

for (const arquivo of listarArquivos(path.join(RAIZ, 'Commands'))) {
    if (arquivo === PERMITIDO) continue;
    const codigo = semComentarios(fs.readFileSync(arquivo, 'utf8'));
    if (/marketValue\s*\/\s*10/.test(codigo) || /overall\s*\*\s*10\b/.test(codigo)) {
        suspeitos.push(path.relative(RAIZ, arquivo));
    }
}

check('nenhum arquivo deriva overall de marketValue', suspeitos.length === 0,
    suspeitos.length ? `\n     ${suspeitos.join('\n     ')}` : '<- o bug silencioso');

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE VALORES PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
