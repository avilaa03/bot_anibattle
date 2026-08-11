/**
 * Testes do roll extra.
 *
 * ## O que ele arrisca quebrar
 *
 * Vender roll converte moeda em carta, e carta em moeda. Sem trava, fecha
 * uma alça: o rico rola mais, tira carta boa, vende, e rola ainda mais —
 * a economia deixa de depender de tempo e passa a depender de saldo.
 *
 * Duas coisas seguram, e as duas precisam valer sempre:
 *
 * 1. **O preço fica MUITO acima do que um roll rende.** Se cair abaixo,
 *    comprar roll vira lucro e a alça abre.
 * 2. **O limite diário é o teto absoluto.** Por mais rico que alguém seja,
 *    existe um número de rolls por dia que ele não passa.
 *
 * E o preço precisa acompanhar o `VALOR_MULTIPLICADOR`: um preço fixo
 * ficaria para trás no dia em que as cartas encarecessem, e a alça abriria
 * sozinha sem ninguém tocar no arquivo.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

const rollExtra = require(ROOT + 'extraRoll.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const brl = (n) => Math.round(n).toLocaleString('pt-BR');

console.log('=== COMPRAR ROLL NUNCA PODE SER LUCRO ===');
const ev = rollExtra.valorEsperadoDoRoll();
const precos = rollExtra.precos();

console.log(`  (um /roll rende ~${brl(ev)} em valor de mercado)`);
precos.forEach((preco, i) => {
    check(`${i + 1}ª compra do dia custa mais que um roll rende`,
        preco > ev, `(${brl(preco)} vs ${brl(ev)} — ${(preco / ev).toFixed(1)}x)`);
});

check('mesmo a primeira já é bem cara', precos[0] / ev >= 5,
    `(${(precos[0] / ev).toFixed(1)}x)`);

console.log('\n=== O preço sobe a cada compra do dia ===');
// O primeiro é conveniência para quem perdeu a janela da manhã. O terceiro
// é alguém tentando virar saldo em cartas — e é esse que precisa doer.
for (let i = 0; i < precos.length - 1; i++) {
    check(`${i + 2}ª custa mais que a ${i + 1}ª`, precos[i + 1] > precos[i],
        `(${brl(precos[i])} -> ${brl(precos[i + 1])})`);
}

console.log('\n=== O limite não sai de sincronia com os preços ===');
// O limite É o comprimento da lista de preços. Se alguém acrescentar um
// preço e esquecer de subir o limite, o preço extra nunca seria usado.
check('limite igual à quantidade de preços',
    rollExtra.LIMITE_DIARIO === precos.length,
    `(${rollExtra.LIMITE_DIARIO} e ${precos.length})`);

console.log('\n=== Preço do próximo ===');
check('sem compras hoje, o primeiro preço', rollExtra.precoDoProximo(0) === precos[0]);
check('depois de uma, o segundo', rollExtra.precoDoProximo(1) === precos[1]);
check('no limite, devolve null', rollExtra.precoDoProximo(rollExtra.LIMITE_DIARIO) === null);
check('acima do limite também', rollExtra.precoDoProximo(99) === null);
check('valor negativo não quebra', rollExtra.precoDoProximo(-5) === precos[0]);
check('valor inválido não quebra', rollExtra.precoDoProximo('abc') === precos[0]);

console.log('\n=== Restante ===');
check('sem compras, restam todos', rollExtra.restante(0) === rollExtra.LIMITE_DIARIO);
check('no limite, resta zero', rollExtra.restante(rollExtra.LIMITE_DIARIO) === 0);
check('nunca fica negativo', rollExtra.restante(99) === 0);

console.log('\n=== O preço acompanha o VALOR_MULTIPLICADOR ===');
//
// Este é o furo que um preço fixo teria. Encarecer as cartas sem
// reprecificar o roll extra abriria a alça em silêncio.
const original = process.env.VALOR_MULTIPLICADOR;

for (const multiplicador of ['0.5', '3', '10']) {
    process.env.VALOR_MULTIPLICADOR = multiplicador;
    delete require.cache[require.resolve(ROOT + 'cardValues.js')];
    delete require.cache[require.resolve(ROOT + 'draw.js')];
    delete require.cache[require.resolve(ROOT + 'extraRoll.js')];
    const recarregado = require(ROOT + 'extraRoll.js');

    const evAtual = recarregado.valorEsperadoDoRoll();
    const baratos = recarregado.precos().filter((p) => p <= evAtual);

    check(`multiplicador ${multiplicador}x: nenhum preço vira lucro`,
        baratos.length === 0,
        baratos.length ? `(${baratos.map(brl).join(', ')} vs ${brl(evAtual)})` : '');
}

if (original === undefined) delete process.env.VALOR_MULTIPLICADOR;
else process.env.VALOR_MULTIPLICADOR = original;
delete require.cache[require.resolve(ROOT + 'cardValues.js')];
delete require.cache[require.resolve(ROOT + 'draw.js')];
delete require.cache[require.resolve(ROOT + 'extraRoll.js')];

console.log('\n=== O teto diário é real ===');
// Com 3 por dia e o cooldown de 15 min, o teto de rolls de um jogador sai
// de 96 para 99 — 3% a mais, não uma ordem de grandeza. É esse número que
// diz se a trava está fazendo efeito.
const ROLLS_POR_DIA_GRATIS = Math.floor((24 * 60) / 15);
const tetoComExtras = ROLLS_POR_DIA_GRATIS + rollExtra.LIMITE_DIARIO;
check('o extra soma pouco ao teto diário',
    (tetoComExtras / ROLLS_POR_DIA_GRATIS) < 1.1,
    `(${ROLLS_POR_DIA_GRATIS} -> ${tetoComExtras}, +${(((tetoComExtras / ROLLS_POR_DIA_GRATIS) - 1) * 100).toFixed(0)}%)`);

console.log('\n=== Comprar o dia inteiro custa caro ===');
// Se comprar tudo fosse barato perto do que rende, o limite seria a única
// trava — e uma trava sozinha é frágil.
const custoTotal = precos.reduce((a, b) => a + b, 0);
const rendeTotal = ev * rollExtra.LIMITE_DIARIO;
check('o dia inteiro de extras é prejuízo grande',
    custoTotal > rendeTotal * 10,
    `(${brl(custoTotal)} para receber ~${brl(rendeTotal)})`);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE ROLL EXTRA PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
