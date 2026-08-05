/**
 * Testes das caixas.
 *
 * ## O teste que dá nome ao arquivo
 *
 * **Nenhuma caixa pode devolver mais valor do que custa.** Se isso se
 * inverter, abrir caixa vira renda: compra por X, revende no mercado por
 * mais de X, repete. É o "glitch de dinheiro infinito", e ele não precisa
 * de bug nenhum para acontecer — basta alguém mexer numa distribuição ou
 * no `VALOR_MULTIPLICADOR` sem refazer a conta.
 *
 * O preço é derivado do valor esperado justamente para isso ser
 * impossível por construção. Estes testes confirmam que a derivação
 * funciona, inclusive quando o multiplicador global muda.
 *
 * ## Por que a referência é o valor de MERCADO
 *
 * O jogador revende ao preço cheio para outro jogador. Usar a venda
 * rápida como régua daria uma folga falsa (ela paga de 15% a 50%) e a
 * caixa viraria lucro garantido para quem vende no mercado.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

const caixas = require(ROOT + 'caixas.js');
const valores = require(ROOT + 'valores.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const brl = (n) => Math.round(n).toLocaleString('pt-BR');

console.log('=== NENHUMA CAIXA PODE SER IMPRESSORA DE DINHEIRO ===');
for (const caixa of caixas.aVenda()) {
    const ev = caixas.valorEsperado(caixa);
    check(
        `${caixa.nome}: preço acima do valor esperado`,
        caixa.preco > ev,
        `(${brl(caixa.preco)} vs ${brl(ev)} — ${(caixa.preco / ev).toFixed(2)}x)`
    );
}

console.log('\n=== E com margem, não no limite ===');
// Empatar não basta: com variância, um jogador sortudo lucraria o
// suficiente para virar estratégia.
for (const caixa of caixas.aVenda()) {
    const razao = caixa.preco / caixas.valorEsperado(caixa);
    check(`${caixa.nome}: margem de pelo menos ${caixas.MARGEM}x`,
        razao >= caixas.MARGEM, `(${razao.toFixed(2)}x)`);
}

console.log('\n=== A margem sobrevive ao VALOR_MULTIPLICADOR ===');
//
// Este é o furo que o preço fixo teria. Subir o multiplicador para
// calibrar a economia encareceria as cartas e deixaria o preço da caixa
// para trás — transformando uma caixa segura em impressora, sem ninguém
// tocar no arquivo das caixas.
//
// O preço é derivado, então acompanha. Aqui simulamos o multiplicador
// recarregando o módulo de valores com outro ambiente.
const multiplicadorOriginal = process.env.VALOR_MULTIPLICADOR;

for (const multiplicador of ['0.5', '3', '10']) {
    process.env.VALOR_MULTIPLICADOR = multiplicador;
    delete require.cache[require.resolve(ROOT + 'valores.js')];
    delete require.cache[require.resolve(ROOT + 'caixas.js')];
    const recarregado = require(ROOT + 'caixas.js');

    const ruins = recarregado.aVenda().filter((c) => c.preco <= recarregado.valorEsperado(c));
    check(`multiplicador ${multiplicador}x: nenhuma caixa vira lucro`,
        ruins.length === 0,
        ruins.length ? `(${ruins.map((c) => c.nome).join(', ')})` : '');
}

// Restaura o ambiente e os módulos, senão os testes seguintes usariam a
// tabela de valores errada.
if (multiplicadorOriginal === undefined) delete process.env.VALOR_MULTIPLICADOR;
else process.env.VALOR_MULTIPLICADOR = multiplicadorOriginal;
delete require.cache[require.resolve(ROOT + 'valores.js')];
delete require.cache[require.resolve(ROOT + 'caixas.js')];
const caixasLimpo = require(ROOT + 'caixas.js');

console.log('\n=== As distribuições somam 100 ===');
// Tabela somando 99 não quebra nada visivelmente: só faz a última faixa
// nunca sair. É o mesmo erro que o sorteio.js documenta.
for (const caixa of caixasLimpo.todas()) {
    const soma = Object.values(caixa.distribuicao).reduce((a, b) => a + b, 0);
    check(`${caixa.nome} soma 100`, Math.abs(soma - 100) < 0.001, `(${soma})`);
}

console.log('\n=== A escada de caixas é crescente ===');
// Caixa mais cara precisa entregar mais, senão ninguém sobe a escada.
const escada = ['comum', 'tematica', 'elite', 'lendaria'].map((c) => caixasLimpo.getCaixa(c));
for (let i = 0; i < escada.length - 1; i++) {
    const a = escada[i];
    const b = escada[i + 1];
    if (a.chave === 'comum' && b.chave === 'tematica') continue; // a temática vale pela mira
    check(`${b.nome} entrega mais que ${a.nome}`,
        caixasLimpo.valorEsperado(b) > caixasLimpo.valorEsperado(a),
        `(${brl(caixasLimpo.valorEsperado(a))} -> ${brl(caixasLimpo.valorEsperado(b))})`);
}

console.log('\n=== Uma caixa nunca vale mais que a carta que ela promete ===');
// A Lendária promete 10% de Mestra. Se o preço dela passasse do valor de
// uma Mestra, ninguém abriria — compraria a carta direto no mercado.
const lendaria = caixasLimpo.getCaixa('lendaria');
const umaMestra = valores.valorDeMercado('master', caixasLimpo.OVR_REFERENCIA);
check('a Caixa Lendária custa menos que uma Mestra',
    lendaria.preco < umaMestra,
    `(${brl(lendaria.preco)} vs ${brl(umaMestra)})`);

console.log('\n=== Caixa fora de venda ===');
const apoiador = caixasLimpo.getCaixa('apoiador');
check('a do apoiador não tem preço', apoiador.preco === null);
check('e fica fora da loja', !caixasLimpo.aVenda().some((c) => c.chave === 'apoiador'));
check('mas continua na listagem geral', caixasLimpo.todas().some((c) => c.chave === 'apoiador'));

console.log('\n=== Sorteio dentro da caixa ===');
const elite = caixasLimpo.getCaixa('elite');
check('sempre devolve uma raridade da distribuição',
    Array.from({ length: 500 }, () => caixasLimpo.sortearRaridade(elite))
        .every((r) => elite.distribuicao[r] !== undefined));

// A Caixa de Elite garante Ultra Rara ou melhor. Comum saindo dela seria
// propaganda enganosa.
check('a Caixa de Elite nunca devolve Comum ou Rara',
    Array.from({ length: 500 }, () => caixasLimpo.sortearRaridade(elite))
        .every((r) => r !== 'common' && r !== 'rare'));

// Extremos do gerador: 0 pega a primeira faixa, 0.999... a última.
check('aleatório 0 devolve a primeira faixa',
    caixasLimpo.sortearRaridade(elite, () => 0) === 'ultra rare');
check('aleatório quase 1 devolve a última',
    caixasLimpo.sortearRaridade(elite, () => 0.9999999) === 'master');

console.log('\n=== A distribuição sai perto do declarado ===');
const lendariaDist = caixasLimpo.getCaixa('lendaria');
const N = 40000;
const contagem = {};
for (let i = 0; i < N; i++) {
    const r = caixasLimpo.sortearRaridade(lendariaDist);
    contagem[r] = (contagem[r] || 0) + 1;
}
for (const [raridade, esperado] of Object.entries(lendariaDist.distribuicao)) {
    const obtido = ((contagem[raridade] || 0) / N) * 100;
    check(`${raridade}: ~${esperado}%`, Math.abs(obtido - esperado) < 2,
        `(${obtido.toFixed(1)}%)`);
}

console.log('\n=== Entradas estranhas ===');
check('caixa inexistente devolve null', caixasLimpo.getCaixa('inventada') === null);
check('chave nula não quebra', caixasLimpo.getCaixa(null) === null);
check('existe() confere', caixasLimpo.existe('lendaria') && !caixasLimpo.existe('nada'));
check('MAIÚSCULA é aceita', caixasLimpo.getCaixa('LENDARIA')?.chave === 'lendaria');

console.log('\n=== Limites diários ===');
// Sem limite, a caixa vira torneira mesmo com EV negativo: quem tem muito
// dinheiro converteria saldo em cartas em escala.
for (const caixa of caixasLimpo.aVenda()) {
    check(`${caixa.nome} tem limite diário`,
        Number.isInteger(caixa.limiteDia) && caixa.limiteDia > 0,
        `(${caixa.limiteDia})`);
}
check('a mais cara tem o menor limite',
    caixasLimpo.getCaixa('lendaria').limiteDia <= caixasLimpo.getCaixa('comum').limiteDia);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE CAIXAS PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
