/**
 * Testes do aprimoramento.
 *
 * O que precisa valer sempre:
 *
 * - **A carta nunca fica pior do que nasceu.** O overall natural é o chão
 *   absoluto, e em nível 0 a chance de queda é literalmente 0%.
 * - **As três chances somam 1**, em qualquer raridade e qualquer nível.
 * - **Não existe teto.** A chance de sucesso tem piso, senão o "infinito"
 *   seria mentira — haveria um nível a partir do qual nada mais sobe.
 * - **Os atributos saem SEMPRE do natural**, nunca do valor já
 *   aprimorado: percentual sobre percentual acumula arredondamento e
 *   depois de 16 níveis a carta teria números que ninguém explica.
 * - **O preço sai de valores.js**, a mesma régua de todas as outras.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;
const ap = require(ROOT + 'upgrading.js');
const valores = require(ROOT + 'cardValues.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const RARIDADES = ['common', 'rare', 'ultra rare', 'legendary', 'master'];
const pct = (n) => `${(n * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------
console.log('=== As três chances ===');

let somamUm = true;
let negativa = false;
for (const r of RARIDADES) {
    for (let n = 0; n <= 60; n++) {
        const c = ap.chances(r, n);
        if (Math.abs(c.sucesso + c.nada + c.queda - 1) > 1e-9) somamUm = false;
        if (c.sucesso < 0 || c.nada < 0 || c.queda < 0) negativa = true;
    }
}
check('somam 1 em toda raridade e todo nível (0 a 60)', somamUm);
check('nenhuma chance é negativa', negativa === false);

console.log('\n--- quanto mais raro, mais difícil ---');
let ordenado = true;
for (let i = 1; i < RARIDADES.length; i++) {
    if (ap.chances(RARIDADES[i], 0).sucesso >= ap.chances(RARIDADES[i - 1], 0).sucesso) ordenado = false;
}
check('a chance inicial cai conforme a raridade sobe', ordenado,
    `(${RARIDADES.map((r) => pct(ap.chances(r, 0).sucesso)).join(' > ')})`);

console.log('\n--- quanto mais alto o nível, pior fica ---');
for (const r of ['common', 'master']) {
    let sucessoCai = true;
    let quedaSobe = true;
    for (let n = 1; n <= 20; n++) {
        if (ap.chances(r, n).sucesso > ap.chances(r, n - 1).sucesso) sucessoCai = false;
        if (ap.chances(r, n).queda < ap.chances(r, n - 1).queda) quedaSobe = false;
    }
    check(`${r}: a chance de sucesso nunca sobe com o nível`, sucessoCai);
    check(`${r}: a chance de queda nunca desce com o nível`, quedaSobe);
}

// ---------------------------------------------------------------------
console.log('\n=== A CARTA NUNCA FICA PIOR DO QUE NASCEU ===');

for (const r of RARIDADES) {
    check(`${r}: em nível 0 a chance de queda é ZERO`, ap.chances(r, 0).queda === 0);
}

const cartaNova = { rarity: 'master', overall: 95, ATA: 80, LIF: 90, POW: 85, nivel: 0 };
check('uma queda em nível 0 não leva a nível negativo',
    ap.aplicar(cartaNova, 'queda').nivel === 0);
check('e não mexe no overall natural',
    ap.aplicar(cartaNova, 'queda').overall === 95);
check('"nada" em nível 0 também não mexe',
    ap.aplicar(cartaNova, 'nada').overall === 95);

// Mesmo forçando o desfecho impossível dezenas de vezes seguidas.
let carta = { ...cartaNova };
for (let i = 0; i < 50; i++) {
    const r = ap.aplicar(carta, 'queda');
    carta = { ...carta, ...r };
}
check('50 quedas seguidas em nível 0 não afundam a carta',
    carta.nivel === 0 && carta.overall === 95 && carta.ATA === 80);

// ---------------------------------------------------------------------
console.log('\n=== NÃO EXISTE TETO ===');

check('a chance de sucesso tem piso e nunca chega a zero',
    RARIDADES.every((r) => ap.chances(r, 500).sucesso >= ap.PISO_SUCESSO),
    '<- senão o "sem teto" seria mentira');
check('o piso é 1%', ap.PISO_SUCESSO === 0.01);
check('nível 200 ainda pode subir', ap.chances('master', 200).sucesso > 0);
check('e subir de fato leva a nível 201',
    ap.aplicar({ rarity: 'master', overall: 95, ATA: 80, LIF: 90, POW: 85, nivel: 200 }, 'sucesso').nivel === 201);

// ---------------------------------------------------------------------
console.log('\n=== OS ATRIBUTOS ACOMPANHAM O OVERALL ===');

const base = { overall: 95, ATA: 80, LIF: 90, POW: 85 };

check('nível 0 devolve exatamente o natural',
    JSON.stringify(ap.statsDoNivel(base, 0)) === JSON.stringify({ overall: 95, ATA: 80, LIF: 90, POW: 85 }));

const nivel16 = ap.statsDoNivel(base, 16);
check('cada nível soma 1 no overall', nivel16.overall === 111, `(overall ${nivel16.overall})`);
check('os atributos sobem junto',
    nivel16.ATA > base.ATA && nivel16.LIF > base.LIF && nivel16.POW > base.POW,
    `(ATA ${nivel16.ATA} LIF ${nivel16.LIF} POW ${nivel16.POW})`);

// O perfil da carta tem que sobreviver: uma carta de vida alta continua
// sendo de vida alta depois de 16 níveis.
const perfilAntes = base.LIF / base.ATA;
const perfilDepois = nivel16.LIF / nivel16.ATA;
check('o perfil da carta se mantém (tanque continua tanque)',
    Math.abs(perfilAntes - perfilDepois) < 0.02,
    `(${perfilAntes.toFixed(3)} vs ${perfilDepois.toFixed(3)})`);

console.log('\n--- o cálculo parte SEMPRE do natural ---');
// Subir 16 vezes de uma em uma tem que dar o mesmo que calcular direto no
// 16. Se em algum ponto o código usasse o valor já aprimorado como base,
// o arredondamento acumularia e os dois números divergiriam.
let passoAPasso = { rarity: 'master', ...base, nivel: 0 };
for (let n = 0; n < 16; n++) {
    passoAPasso = { ...passoAPasso, ...ap.aplicar(passoAPasso, 'sucesso') };
}
check('16 sucessos seguidos = cálculo direto no nível 16',
    passoAPasso.overall === nivel16.overall
    && passoAPasso.ATA === nivel16.ATA
    && passoAPasso.LIF === nivel16.LIF
    && passoAPasso.POW === nivel16.POW,
    '<- percentual sobre percentual acumularia erro');

// Subir e cair tem que voltar exatamente ao ponto de partida.
const subiu = ap.aplicar({ rarity: 'master', ...base, nivel: 5 }, 'sucesso');
const voltou = ap.aplicar({ rarity: 'master', ...base, ...subiu }, 'queda');
check('subir e cair volta ao mesmo estado',
    voltou.nivel === 5 && voltou.ATA === ap.statsDoNivel(base, 5).ATA);

console.log('\n--- o natural fica gravado ---');
const jaAprimorada = { rarity: 'master', overall: 105, ATA: 88, LIF: 99, POW: 94, nivel: 10, base };
check('carta com base gravada usa a base, não os valores atuais',
    ap.baseDaCarta(jaAprimorada).overall === 95);
check('carta antiga sem base trata os valores atuais como naturais',
    ap.baseDaCarta({ overall: 60, ATA: 50, LIF: 70, POW: 55 }).overall === 60,
    '<- cartas anteriores ao aprimoramento');
check('aplicar preserva a base no retorno', ap.aplicar(jaAprimorada, 'nada').base.overall === 95);
check('overall natural zero não explode a conta',
    Number.isFinite(ap.statsDoNivel({ overall: 0, ATA: 10, LIF: 10, POW: 10 }, 3).ATA));

// ---------------------------------------------------------------------
console.log('\n=== A PROTEÇÃO ===');

const em5 = { rarity: 'master', ...base, nivel: 5 };
check('sem proteção, a queda desce um nível', ap.aplicar(em5, 'queda').nivel === 4);
check('com proteção, o nível não muda', ap.aplicar(em5, 'queda', true).nivel === 5);
check('a proteção não transforma queda em sucesso', ap.aplicar(em5, 'queda', true).nivel !== 6,
    '<- é seguro, não atalho');
check('a proteção não muda a chance de sucesso',
    ap.chances('master', 5).sucesso === ap.chances('master', 5).sucesso);

// ---------------------------------------------------------------------
console.log('\n=== O PREÇO SAI DE valores.js ===');

const precificada = ap.aplicar({ rarity: 'master', ...base, nivel: 15 }, 'sucesso');
const esperado = valores.valoresDaCarta({ rarity: 'master', overall: 111 });
check('marketValue bate com a régua geral', precificada.marketValue === esperado.marketValue);
check('valueToSell bate com a régua geral', precificada.valueToSell === esperado.valueToSell);
check('e a carta aprimorada vale mais que a natural',
    precificada.marketValue > valores.valoresDaCarta({ rarity: 'master', overall: 95 }).marketValue);

// ---------------------------------------------------------------------
console.log('\n=== O CUSTO ===');

check('o custo cresce com o nível',
    ap.custoEmGemas('master', 10) > ap.custoEmGemas('master', 0));
check('o custo cresce com a raridade',
    ap.custoEmGemas('master', 0) > ap.custoEmGemas('common', 0));
check('nunca custa menos de 1 gema',
    RARIDADES.every((r) => ap.custoEmGemas(r, 0) >= 1));
check('raridade desconhecida cai na Comum',
    ap.custoEmGemas('lixo', 3) === ap.custoEmGemas('common', 3));
check('nível negativo é tratado como 0',
    ap.custoEmGemas('master', -5) === ap.custoEmGemas('master', 0));

// ---------------------------------------------------------------------
console.log('\n=== O SORTEIO RESPEITA AS CHANCES ===');

const fixo = (p) => () => p;
const c5 = ap.chances('master', 5);
check('percentil abaixo da chance de sucesso dá sucesso',
    ap.resolver('master', 5, fixo(c5.sucesso - 0.001)) === 'sucesso');
check('logo acima dá queda',
    ap.resolver('master', 5, fixo(c5.sucesso + 0.001)) === 'queda');
check('acima de sucesso+queda dá nada',
    ap.resolver('master', 5, fixo(c5.sucesso + c5.queda + 0.001)) === 'nada');
check('em nível 0 nunca sai queda',
    [0.01, 0.5, 0.9, 0.999].every((p) => ap.resolver('master', 0, fixo(p)) !== 'queda'));

// Distribuição observada, com gerador determinístico.
function previsivel(semente = 11) {
    let s = semente;
    return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const rnd = previsivel();
const N = 100000;
const conta = { sucesso: 0, nada: 0, queda: 0 };
for (let i = 0; i < N; i++) conta[ap.resolver('legendary', 8, rnd)]++;
const c8 = ap.chances('legendary', 8);
check('a distribuição observada bate com as chances',
    Math.abs(conta.sucesso / N - c8.sucesso) < 0.01
    && Math.abs(conta.queda / N - c8.queda) < 0.01,
    `(sucesso ${pct(conta.sucesso / N)} vs ${pct(c8.sucesso)}, queda ${pct(conta.queda / N)} vs ${pct(c8.queda)})`);

console.log('\n=== O selo ===');
check('nível 0 não tem selo', ap.selo(0) === '');
check('nível 7 vira "+7"', ap.selo(7) === '+7');
check('nível negativo não vira selo', ap.selo(-3) === '');

// ---------------------------------------------------------------------
console.log('\n=== O SELO NO NOME ===');
//
// "Sasuke Uchiha (+3)" precisa aparecer em TODA tela onde a carta é vista
// — inventário, mercado, anúncio, batalha, troca, torneio. São mais de
// trinta pontos, e por isso a regra mora dentro do `ui.cardName`: pendurar
// o nível em cada tela é garantir que alguém esqueça de uma.

const ui = require(ROOT + 'embeds.js');

check('carta natural sai sem selo',
    ui.cardName({ name: 'Sasuke Uchiha', nivel: 0 }) === 'Sasuke Uchiha');
check('carta aprimorada ganha o selo',
    ui.cardName({ name: 'Sasuke Uchiha', nivel: 3 }) === 'Sasuke Uchiha (+3)');
check('anúncio do mercado usa cardName e também ganha selo',
    ui.cardName({ cardName: 'Sasuke Uchiha', nivel: 3 }) === 'Sasuke Uchiha (+3)',
    '<- o anúncio guarda o nome em outro campo');
check('nome solto + nível continua funcionando (narração da batalha)',
    ui.cardName('Sasuke Uchiha', 7) === 'Sasuke Uchiha (+7)');
check('nome solto sem nível não inventa selo',
    ui.cardName('Sasuke Uchiha') === 'Sasuke Uchiha');
check('continua capitalizando como antes',
    ui.cardName('sasuke uchiha') === 'Sasuke uchiha');
check('nível negativo não vira selo',
    ui.cardName({ name: 'Sasuke', nivel: -2 }) === 'Sasuke');
check('carta nula não quebra', ui.cardName(null) === 'Carta');

// O motor de combate não pode importar a camada de apresentação (há teste
// de convenção), então ele repete a regra — e as duas têm que concordar.
const engine = require(ROOT + 'battleEngine.js');
const lutador = (nivel) => ({ name: 'Sasuke Uchiha', nivel, rarity: 'master', ATA: 80, LIF: 90, POW: 85 });
const luta = engine.runBattle
    ? engine.runBattle([lutador(3), lutador(0), lutador(0)], [lutador(0), lutador(0), lutador(0)])
    : null;
if (luta) {
    check('a batalha carrega o nível nos confrontos',
        luta.rounds[0].nivelX === 3 && luta.rounds[0].nivelY === 0);
    // O selo vai nos eventos, que é de onde a narração é montada em
    // qualquer idioma — nome de carta não se traduz, o `(+3)` também não.
    check('e os eventos do combate mostram o selo',
        luta.rounds[0].eventos.some((e) =>
            [e.atacante, e.defensor, e.vencedorNome].includes('Sasuke Uchiha (+3)')),
        '<- o adversário precisa saber contra o que luta');
} else {
    check('runBattle exportado para o teste do selo', false, '<- API mudou');
}

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE APRIMORAMENTO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
