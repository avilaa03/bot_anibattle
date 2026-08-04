/**
 * Testes da montagem dos botões da escolha de time.
 *
 * O bug que este arquivo evita: o Discord aceita no máximo 5 linhas de 5
 * botões por mensagem. Com `MAX_CARDS_SHOWN = 25` as cinco linhas ficavam
 * cheias de cartas e o botão "Desistir" não cabia — e a API não reclama,
 * o botão simplesmente não aparece.
 *
 * Sem botão de desistir, quem tem o oponente sumido fica com a aposta
 * retida até a varredura passar. É uma falha silenciosa que custa moeda
 * do jogador.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands') + path.sep;

const { buildDeckChoiceMessage } = require(ROOT + 'actions/collect/battleCollect.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const MAX_LINHAS = 5;
const MAX_BOTOES = 5;

/** Inventário falso com N cartas. */
const inventario = (n) => Array.from({ length: n }, (_, i) => ({
    _id: `carta${i}`,
    name: `Personagem ${i}`,
    series: 'Série',
    rarity: 'common',
    overall: 50 - i,
    ATA: 30, LIF: 80, POW: 30
}));

const montar = (n, selecionadas = []) =>
    buildDeckChoiceMessage('b1', 'X', inventario(n), selecionadas, [], 0);

const todosBotoes = (componentes) =>
    componentes.flatMap((linha) => linha.components.map((b) => b.data));

const temDesistir = (componentes) =>
    todosBotoes(componentes).some((b) => String(b.custom_id).startsWith('battle_cancel_'));

(async () => {
console.log('=== Limites do Discord ===');
for (const n of [1, 3, 5, 6, 12, 19, 20, 40, 100]) {
    const { components } = montar(n);
    const linhasOk = components.length <= MAX_LINHAS;
    const botoesOk = components.every((l) => l.components.length <= MAX_BOTOES);
    check(`${n} cartas: no máximo ${MAX_LINHAS} linhas de ${MAX_BOTOES}`, linhasOk && botoesOk,
        `(${components.length} linha(s))`);
}

console.log('\n=== O botão de desistir existe sempre ===');
for (const n of [1, 5, 6, 20, 40, 100]) {
    const { components } = montar(n);
    check(`${n} cartas tem "Desistir"`, temDesistir(components),
        n >= 20 ? '<- era aqui que ele sumia' : '');
}

console.log('\n=== Inventário vazio ===');
const vazio = montar(0);
check('sem cartas não quebra', Array.isArray(vazio.components));

console.log('\n=== Identificadores dos botões ===');
const { components } = montar(8);
const botoes = todosBotoes(components);
const cartas = botoes.filter((b) => String(b.custom_id).startsWith('battle_pick_'));
const cancelar = botoes.filter((b) => String(b.custom_id).startsWith('battle_cancel_'));

check('um customId por carta mostrada', cartas.length === 8, `(${cartas.length})`);
check('exatamente um botão de desistir', cancelar.length === 1, `(${cancelar.length})`);
check('o customId de desistir carrega o battleId', cancelar[0].custom_id === 'battle_cancel_b1',
    `(${cancelar[0].custom_id})`);

// O limite do Discord para custom_id é 100 caracteres. Estourar faz a
// mensagem inteira ser recusada pela API.
const maiorId = Math.max(...botoes.map((b) => String(b.custom_id).length));
check('nenhum customId passa de 100 caracteres', maiorId <= 100, `(maior: ${maiorId})`);

const maiorLabel = Math.max(...botoes.map((b) => String(b.label || '').length));
check('nenhum rótulo passa de 80 caracteres', maiorLabel <= 80, `(maior: ${maiorLabel})`);

console.log('\n=== Cartas já escolhidas ===');
const comSelecao = montar(8, ['carta0', 'carta1']);
const desativados = todosBotoes(comSelecao.components)
    .filter((b) => String(b.custom_id).startsWith('battle_pick_') && b.disabled);
check('carta escolhida fica desativada', desativados.length === 2, `(${desativados.length})`);
check('desistir continua disponível', temDesistir(comSelecao.components));

console.log('\n=== Nome comprido não estoura o rótulo ===');
const longo = buildDeckChoiceMessage('b1', 'X', [{
    _id: 'x', name: 'A'.repeat(200), series: 'S', rarity: 'common',
    overall: 50, ATA: 30, LIF: 80, POW: 30
}], [], [], 0);
const rotulos = todosBotoes(longo.components).map((b) => String(b.label || '').length);
check('rótulo cortado em 80', Math.max(...rotulos) <= 80, `(maior: ${Math.max(...rotulos)})`);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE BOTÕES PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
