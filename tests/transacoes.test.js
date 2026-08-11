/**
 * Testes do livro-razão da economia.
 *
 * O que precisa valer sempre:
 *
 * - **Registrar NUNCA derruba a operação que descreve.** Se o banco
 *   falhar, o jogador ainda compra, desmancha e aprimora — ele só não fica
 *   com a linha no extrato. O contrário seria muito pior: um erro no
 *   razão impedindo alguém de gastar a moeda que já foi debitada.
 * - O sinal do `moedaDelta` diz para que lado a moeda foi. Trocar isso
 *   inverteria todo relatório de sink em silêncio.
 * - Item com quantidade zero ou sem chave não vira linha: sujeira no
 *   razão é pior que ausência, porque ele é usado para investigar fraude.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

// Duplo do schema: guarda o que seria gravado, sem tocar em banco.
let gravadas = [];
let falharNaProxima = false;

const Transacao = {
    async create(doc) {
        if (falharNaProxima) {
            falharNaProxima = false;
            throw new Error('banco indisponível');
        }
        gravadas.push(doc);
        return doc;
    },
    find() {
        const encadeavel = {
            sort: () => encadeavel,
            limit: () => encadeavel,
            lean: async () => gravadas
        };
        return encadeavel;
    },
    async aggregate() {
        return [];
    }
};
require.cache[require.resolve(ROOT + 'transactionSchema.js')] = { exports: Transacao };

const transacoes = require(ROOT + 'transactions.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const limpar = () => { gravadas = []; };

(async () => {
console.log('=== O razão nunca derruba a operação ===');
//
// Esta é a regra que mais importa. Um erro aqui não pode virar um jogador
// que pagou e não recebeu.
limpar();
falharNaProxima = true;
let resultado;
let estourou = false;
try {
    resultado = await transacoes.registrar({ userId: 'u1', tipo: 'compra', moedaDelta: -150 });
} catch {
    estourou = true;
}
check('falha no banco não propaga exceção', estourou === false);
check('e devolve null em vez de quebrar quem chamou', resultado === null);
check('nada foi gravado', gravadas.length === 0);

console.log('\n=== Compra na loja ===');
limpar();
await transacoes.compra({ userId: 'u1', item: 'gema', quantidade: 10, total: 1500, saldoDepois: 8500 });

const compra = gravadas[0];
check('gravou uma linha', gravadas.length === 1);
check('tipo correto', compra.tipo === 'compra');
check('a moeda sai NEGATIVA', compra.moedaDelta === -1500, `(${compra.moedaDelta})`);
check('o item entra POSITIVO', compra.itens[0].quantidade === 10);
check('guarda o saldo depois', compra.saldoDepois === 8500);
check('calcula o preço unitário', compra.contexto.precoUnitario === 150);

console.log('\n=== O sinal do delta separa sink de torneira ===');
limpar();
await transacoes.registrar({ userId: 'u1', tipo: 'venda_rapida', moedaDelta: 805 });
await transacoes.registrar({ userId: 'u1', tipo: 'compra', moedaDelta: -1500 });

const entrada = gravadas.find((t) => t.tipo === 'venda_rapida');
const saida = gravadas.find((t) => t.tipo === 'compra');
check('venda rápida CRIA moeda (positivo)', entrada.moedaDelta > 0, `(${entrada.moedaDelta})`);
check('compra DESTRÓI moeda (negativo)', saida.moedaDelta < 0, `(${saida.moedaDelta})`);

console.log('\n=== Aprimoramento gasta item, não moeda ===');
limpar();
await transacoes.registrar({
    userId: 'u1',
    tipo: 'aprimoramento',
    itens: [{ chave: 'gema', quantidade: -87 }, { chave: 'pergaminho', quantidade: -1 }],
    contexto: { desfecho: 'queda', protegido: true, nivelAntes: 8, nivelDepois: 8 }
});

const tentativa = gravadas[0];
check('duas linhas de item', tentativa.itens.length === 2);
check('gema sai negativa', tentativa.itens[0].quantidade === -87);
check('não mexe em moeda', tentativa.moedaDelta === 0);
check('guarda o desfecho', tentativa.contexto.desfecho === 'queda');
check('guarda se o pergaminho segurou', tentativa.contexto.protegido === true);

console.log('\n=== Desmanche não cria moeda ===');
// Cada desmanche é uma venda rápida que deixou de imprimir dinheiro —
// se isto virar positivo, o relatório de inflação passa a mentir.
limpar();
await transacoes.registrar({
    userId: 'u1',
    tipo: 'desmanche',
    itens: [{ chave: 'gema', quantidade: 150 }],
    contexto: { raridade: 'master' }
});
check('moedaDelta zerado', gravadas[0].moedaDelta === 0);
check('a gema entra positiva', gravadas[0].itens[0].quantidade === 150);

console.log('\n=== Sujeira não entra no razão ===');
limpar();
await transacoes.registrar({
    userId: 'u1',
    tipo: 'compra',
    itens: [
        { chave: 'gema', quantidade: 5 },
        { chave: 'vazio', quantidade: 0 },
        { chave: '', quantidade: 3 },
        null
    ]
});
check('item com quantidade zero é descartado',
    gravadas[0].itens.every((i) => i.quantidade !== 0));
check('item sem chave é descartado',
    gravadas[0].itens.every((i) => i.chave));
check('null não quebra', gravadas[0].itens.length === 1, `(${gravadas[0].itens.length})`);

console.log('\n=== Entradas incompletas são recusadas ===');
limpar();
check('sem userId não grava', await transacoes.registrar({ tipo: 'compra' }) === null);
check('sem tipo não grava', await transacoes.registrar({ userId: 'u1' }) === null);
check('chamada vazia não quebra', await transacoes.registrar() === null);
check('nenhuma dessas gravou', gravadas.length === 0);

console.log('\n=== Números estranhos não viram lixo ===');
limpar();
await transacoes.registrar({ userId: 'u1', tipo: 'compra', moedaDelta: 'abc', saldoDepois: 'xyz' });
check('moedaDelta inválido vira 0', gravadas[0].moedaDelta === 0);
check('saldoDepois inválido vira null', gravadas[0].saldoDepois === null);

console.log('\n=== Tipos conhecidos existem para o painel traduzir ===');
for (const tipo of ['compra', 'desmanche', 'aprimoramento', 'venda_rapida']) {
    check(`"${tipo}" tem rótulo`, typeof transacoes.TIPOS[tipo] === 'string');
}

console.log('\n=== Extrato ===');
limpar();
await transacoes.registrar({ userId: 'u1', tipo: 'compra', moedaDelta: -150 });
const linhas = await transacoes.extrato('u1');
check('devolve as linhas', Array.isArray(linhas) && linhas.length === 1);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE TRANSAÇÕES PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
