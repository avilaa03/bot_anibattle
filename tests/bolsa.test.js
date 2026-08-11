/**
 * Testes da bolsa, do catálogo de itens e da economia da gema.
 *
 * O que precisa valer sempre:
 *
 * - **Item nunca vira moeda.** No instante em que existe caminho de
 *   volta, abre-se uma alça: compra de um lado, converte, vende do outro,
 *   e a diferença é renda infinita.
 * - **Desmanchar a Mestra é pior que vendê-la.** É o que impede o jogo de
 *   empurrar o jogador a picotar a carta mais rara que ele tem.
 * - **Desmanchar a Comum é melhor que a venda rápida.** É o que dá função
 *   à Comum, que agora sai em 64% dos rolls.
 * - **Gastar item é atômico.** Dois `/aprimorar` no mesmo instante não
 *   podem gastar a mesma gema duas vezes.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

// ---------------------------------------------------------------------
// Duplo do schema: a bolsa escreve no banco, e aqui interessa a SEMÂNTICA
// das escritas (o `$gte` no filtro, o `$inc` que cria o campo), não o
// Mongo. O duplo implementa só o que `bolsa.js` usa.
// ---------------------------------------------------------------------
const banco = new Map();

function lerCaminho(doc, caminho) {
    return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
}
function escreverCaminho(doc, caminho, valor) {
    const partes = caminho.split('.');
    const ultima = partes.pop();
    let alvo = doc;
    for (const p of partes) {
        if (alvo[p] == null) alvo[p] = {};
        alvo = alvo[p];
    }
    alvo[ultima] = valor;
}

require.cache[require.resolve(ROOT + 'userSchema.js')] = {
    exports: {
        async findOneAndUpdate(filtro, update, opcoes = {}) {
            let doc = banco.get(filtro.id);

            if (!doc) {
                if (!opcoes.upsert) return null;
                doc = { id: filtro.id, balance: 0, bolsa: {} };
                banco.set(filtro.id, doc);
            }

            // O filtro pode exigir quantidade mínima — é o `$gte` que
            // torna o gasto atômico.
            for (const [chave, cond] of Object.entries(filtro)) {
                if (chave === 'id') continue;
                if (cond && typeof cond === 'object' && '$gte' in cond) {
                    if (!(Number(lerCaminho(doc, chave) || 0) >= cond.$gte)) return null;
                }
            }

            for (const [caminho, delta] of Object.entries(update.$inc || {})) {
                escreverCaminho(doc, caminho, Number(lerCaminho(doc, caminho) || 0) + delta);
            }
            return doc;
        }
    }
};

const itens = require(ROOT + 'itens.js');
const bolsa = require(ROOT + 'bolsa.js');
const valores = require(ROOT + 'valores.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};
const brl = (n) => Number(n).toLocaleString('pt-BR');

// ---------------------------------------------------------------------
console.log('=== O catálogo ===');

check('a gema está à venda', itens.getItem('gema')?.preco > 0);
check('o pergaminho está à venda', itens.getItem('pergaminho')?.preco > 0);
check('a loja lista os itens em ordem',
    itens.itensDaLoja().every((i, n, lista) => n === 0 || lista[n - 1].ordem <= i.ordem));
check('chave desconhecida não existe', itens.existe('nao_existe') === false);
check('chave com ponto não existe', itens.existe('bolsa.gema') === false, '<- viraria outro campo no banco');
check('chave com $ não existe', itens.existe('$where') === false);

console.log('\n--- ITEM NUNCA VIRA MOEDA ---');
// Se algum item ganhar preço de venda, a loja deixa de ser sink e vira
// mesa de arbitragem.
const CAMPOS_DE_VENDA = ['precoVenda', 'valueToSell', 'vendePor', 'reembolso', 'trocavel', 'vendavel'];
check('nenhum item expõe caminho de volta para moeda',
    Object.values(itens.ITENS).every((i) => !CAMPOS_DE_VENDA.some((c) => c in i)));

// ---------------------------------------------------------------------
console.log('\n=== A ECONOMIA DA GEMA ===');
//
// A tabela de desmanche só faz sentido em relação à venda rápida. Se o
// preço da gema mudar sem a tabela mudar junto, é aqui que estoura.

const CENARIOS = [
    ['common', 50],
    ['rare', 60],
    ['ultra rare', 75],
    ['legendary', 88],
    ['master', 95]
];

console.log(`\n  (gema a ${brl(itens.PRECO_GEMA)} moedas)\n`);
for (const [raridade, overall] of CENARIOS) {
    const vendaRapida = valores.valorDeVenda(raridade, overall);
    const gemas = itens.gemasDoDesmanche(raridade);
    const valendo = gemas * itens.PRECO_GEMA;
    console.log(`    ${raridade.padEnd(11)} ovr ${overall}: venda ${String(brl(vendaRapida)).padStart(7)}  |  ${String(gemas).padStart(3)} gemas = ${String(brl(valendo)).padStart(7)}`);
}

const desmancheVale = (r, o) => itens.gemasDoDesmanche(r) * itens.PRECO_GEMA;

console.log('');
check('desmanchar a Comum rende mais que a venda rápida',
    desmancheVale('common', 50) > valores.valorDeVenda('common', 50),
    '<- é o que dá função à Comum');
check('vale também para Rara, Ultra e Lendária',
    ['rare', 'ultra rare', 'legendary'].every((r) => {
        const o = { rare: 60, 'ultra rare': 75, legendary: 88 }[r];
        return desmancheVale(r, o) > valores.valorDeVenda(r, o);
    }));

check('MAS a Mestra vale mais VENDIDA que desmanchada',
    desmancheVale('master', 95) < valores.valorDeVenda('master', 95),
    '<- ninguém é empurrado a picotar a carta mais rara');

check('o rendimento em gema cresce com a raridade',
    ['common', 'rare', 'ultra rare', 'legendary', 'master']
        .every((r, n, lista) => n === 0 || itens.gemasDoDesmanche(r) > itens.gemasDoDesmanche(lista[n - 1])));

// A curva de gema é MUITO mais achatada que a de moeda de propósito: se
// acompanhasse a escala da economia, uma Mestra bancaria o aprimoramento
// de um acervo inteiro.
const razaoMoeda = valores.valorDeMercado('master', 50) / valores.valorDeMercado('common', 50);
const razaoGema = itens.gemasDoDesmanche('master') / itens.gemasDoDesmanche('common');
check('a curva de gema é mais achatada que a de moeda',
    razaoGema < razaoMoeda / 10,
    `(gema ${razaoGema}x vs moeda ${Math.round(razaoMoeda)}x)`);

check('raridade desconhecida cai no piso da Comum',
    itens.gemasDoDesmanche('lixo') === itens.gemasDoDesmanche('common'));
check('desmanche nunca rende zero',
    Object.values(itens.GEMAS_POR_DESMANCHE).every((n) => n >= 1));

// ---------------------------------------------------------------------
console.log('\n=== LEITURA DA BOLSA ===');

// `.lean()` devolve objeto puro; o documento Mongoose devolve Map. Os
// dois passam pela mesma função, e já foi fonte de bug em outros pontos.
check('lê de objeto puro (.lean())', bolsa.quantidadeDe({ bolsa: { gema: 7 } }, 'gema') === 7);
check('lê de Map (documento Mongoose)',
    bolsa.quantidadeDe({ bolsa: new Map([['gema', 4]]) }, 'gema') === 4);
check('usuário sem bolsa devolve 0', bolsa.quantidadeDe({}, 'gema') === 0);
check('usuário nulo devolve 0', bolsa.quantidadeDe(null, 'gema') === 0);
check('item ausente devolve 0', bolsa.quantidadeDe({ bolsa: { gema: 3 } }, 'pergaminho') === 0);

// `$inc` não apaga campo: item gasto até o fim fica como 0 no documento.
check('item zerado não aparece na listagem',
    bolsa.listar({ bolsa: { gema: 0, pergaminho: 2 } }).length === 1,
    '<- senão a bolsa mostra "Gema: 0" para sempre');
check('bolsa só com zeros conta como vazia',
    bolsa.estaVazia({ bolsa: { gema: 0 } }) === true);
check('lista traz o item do catálogo junto',
    bolsa.listar({ bolsa: { gema: 3 } })[0].item.nome === itens.localizarPorChave('gema').nome);

// O catálogo guarda mecânica, não texto: quem lê `nome` direto dele vê
// `undefined` na tela, e é um erro que não levanta exceção nenhuma.
check('o catálogo cru não tem nome nem descrição',
    itens.getItem('gema').nome === undefined && itens.getItem('gema').descricao === undefined,
    '<- o texto sai de itens_catalogo.* por localizar()');
check('a bolsa sai no idioma pedido',
    bolsa.listar({ bolsa: { gema: 3 } }, 'en-US')[0].item.nome === 'Upgrade Gem');

// ---------------------------------------------------------------------
console.log('\n=== ESCRITA (com o duplo do banco) ===');

(async () => {
    check('adicionar cria o campo do zero', await bolsa.adicionar('u1', 'gema', 5) === 5);
    check('adicionar soma ao que já havia', await bolsa.adicionar('u1', 'gema', 3) === 8);

    const consumiu = await bolsa.consumir('u1', 'gema', 2);
    check('consumir desconta', bolsa.quantidadeDe(consumiu, 'gema') === 6);

    console.log('\n--- o gasto é atômico ---');
    // O `$gte` mora no FILTRO: quem decide se dá é o banco, na mesma
    // escrita. Conferir antes no Node deixaria uma janela entre a leitura
    // e a gravação.
    check('gastar mais do que tem devolve null',
        await bolsa.consumir('u1', 'gema', 999) === null);
    check('e não mexeu na quantidade',
        bolsa.quantidadeDe(banco.get('u1'), 'gema') === 6);

    // Dois gastos concorrentes de 4, com 6 em mãos: um só pode passar.
    await bolsa.adicionar('u2', 'gema', 6);
    const [a, b] = await Promise.all([
        bolsa.consumir('u2', 'gema', 4),
        bolsa.consumir('u2', 'gema', 4)
    ]);
    check('dois gastos concorrentes: só um passa',
        (a === null) !== (b === null),
        '<- a mesma gema não é gasta duas vezes');
    check('e o saldo de itens não fica negativo',
        bolsa.quantidadeDe(banco.get('u2'), 'gema') === 2);

    console.log('\n--- guardas ---');
    let barrou = false;
    try { await bolsa.adicionar('u1', 'bolsa.gema', 1); } catch { barrou = true; }
    check('chave fora do catálogo é recusada antes de tocar no banco', barrou,
        '<- o catálogo é a lista de permissão');

    let barrouZero = false;
    try { await bolsa.adicionar('u1', 'gema', 0); } catch { barrouZero = true; }
    check('quantidade zero é recusada', barrouZero);

    let barrouNegativo = false;
    try { await bolsa.consumir('u1', 'gema', -5); } catch { barrouNegativo = true; }
    check('quantidade negativa é recusada', barrouNegativo, '<- senão gastar viraria ganhar');

    console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE BOLSA PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
    process.exit(falhas ? 1 : 0);
})();
