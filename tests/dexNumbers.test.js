/**
 * Testes da numeração da Pokédex.
 *
 * O que importa aqui é ESTABILIDADE: o número de uma carta não pode mudar
 * quando o catálogo cresce. Se mudar, o /ficha passa a mostrar carta
 * diferente da que o jogador viu ontem na /pokedex.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

// --- duplo em memória do model Card ---
let docs = [];
const Card = {
    find(q) {
        let r = docs.filter((d) => (q.numero === null ? d.numero == null : d.numero?.$ne !== undefined ? d.numero != null : true));
        const api = {
            sort(s) {
                const campos = Object.keys(s);
                r = [...r].sort((a, b) => {
                    for (const c of campos) {
                        const dir = s[c];
                        const va = a[c], vb = b[c];
                        if (va === vb) continue;
                        if (typeof va === 'string') return va.localeCompare(vb) * dir;
                        return (va - vb) * dir;
                    }
                    return 0;
                });
                return api;
            },
            select() { return api; },
            limit(n) { r = r.slice(0, n); return api; },
            lean: async () => r
        };
        return api;
    },
    findOne(q) {
        let r = docs.filter((d) => (q.numero?.$ne === null ? d.numero != null : true));
        const api = {
            sort(s) {
                const c = Object.keys(s)[0];
                r = [...r].sort((a, b) => (b[c] - a[c]) * (s[c] === -1 ? 1 : -1));
                return api;
            },
            select() { return api; },
            lean: async () => r[0] || null
        };
        return api;
    },
    async bulkWrite(ops) {
        for (const op of ops) {
            const d = docs.find((x) => String(x._id) === String(op.updateOne.filter._id));
            if (d) Object.assign(d, op.updateOne.update.$set);
        }
        return { modifiedCount: ops.length };
    }
};
require.cache[require.resolve(ROOT + 'cardSchema.js')] = { exports: Card };
const { assignMissingDexNumbers, formatarNumero } = require(ROOT + 'dexNumbers.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

(async () => {
console.log('=== Atribuição inicial ===');
docs = [
    { _id: 1, name: 'Gon', series: 'Hunter X Hunter', numero: null },
    { _id: 2, name: 'Killua', series: 'Hunter X Hunter', numero: null },
    { _id: 3, name: 'Naruto', series: 'Naruto', numero: null },
    { _id: 4, name: 'Itachi', series: 'Naruto', numero: null }
];
let r = await assignMissingDexNumbers();
check('numerou as 4 cartas', r.atribuidos === 4, `(${r.primeiro}..${r.ultimo})`);
check('começa no 1', r.primeiro === 1);
check('agrupa por série', docs.find(d=>d._id===1).numero < docs.find(d=>d._id===3).numero,
    `(HxH ${docs.find(d=>d._id===1).numero},${docs.find(d=>d._id===2).numero} | Naruto ${docs.find(d=>d._id===4).numero},${docs.find(d=>d._id===3).numero})`);
const numerosOriginais = docs.map(d => ({ id: d._id, numero: d.numero }));

console.log('\n=== ESTABILIDADE: catálogo cresce, números antigos não mudam ===');
docs.push(
    { _id: 5, name: 'Aizen', series: 'Bleach', numero: null },      // série que viria ANTES alfabeticamente
    { _id: 6, name: 'Hisoka', series: 'Hunter X Hunter', numero: null } // no meio de série existente
);
r = await assignMissingDexNumbers();
check('numerou só as 2 novas', r.atribuidos === 2, `(${r.primeiro}..${r.ultimo})`);

let mudou = numerosOriginais.filter(o => docs.find(d => d._id === o.id).numero !== o.numero);
check('NENHUM número antigo mudou', mudou.length === 0,
    mudou.length ? `-> mudaram: ${mudou.map(m=>m.id).join(',')}` : '');
check('cartas novas foram para o fim', docs.find(d=>d._id===5).numero > 4 && docs.find(d=>d._id===6).numero > 4,
    `(Bleach=${docs.find(d=>d._id===5).numero}, Hisoka=${docs.find(d=>d._id===6).numero})`);

console.log('\n=== Idempotência ===');
r = await assignMissingDexNumbers();
check('rodar de novo não faz nada', r.atribuidos === 0);

console.log('\n=== Sem duplicatas ===');
const nums = docs.map(d => d.numero);
check('todos os números são únicos', new Set(nums).size === nums.length, `(${nums.sort((a,b)=>a-b).join(', ')})`);
check('sequência sem buracos', nums.sort((a,b)=>a-b).every((n,i)=>n===i+1));

console.log('\n=== Formatação ===');
check('42 com catálogo de 1000 -> #0042', formatarNumero(42, 1000) === '#0042', `(${formatarNumero(42,1000)})`);
check('7 com catálogo de 50 -> #007', formatarNumero(7, 50) === '#007', `(${formatarNumero(7,50)})`);
check('sem número -> #???', formatarNumero(null, 100) === '#???');
check('mínimo de 3 casas', formatarNumero(5, 9) === '#005', `(${formatarNumero(5,9)})`);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE NUMERAÇÃO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
