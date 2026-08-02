/**
 * Testes do animador de cartas que não dependem do canvas nativo.
 *
 * O canvas não roda em qualquer ambiente (é binário compilado), então
 * aqui testamos só as regras: quais molduras animam, e se as animações
 * fecham o ciclo — ou seja, se o último quadro emenda no primeiro sem
 * dar um "pulo" visível quando o GIF repete.
 */

const path = require('path');
const fs = require('fs');

let falhas = 0;
function check(nome, cond, extra = '') {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
}

const animatorPath = path.join(__dirname, '..', 'Commands', 'utils', 'cardAnimator.js');
const src = fs.readFileSync(animatorPath, 'utf8');

console.log('=== Quais molduras animam ===');
// Lemos do fonte para não precisar carregar o canvas.
const setMatch = src.match(/MOLDURAS_ANIMADAS = new Set\(\[([^\]]+)\]\)/);
const animadas = setMatch
    ? setMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)
    : [];

check('lista de animadas foi encontrada', animadas.length > 0, `(${animadas.join(', ')})`);
check('bronze NÃO anima (degrau entre planos)', !animadas.includes('bronze'));
check('prata NÃO anima', !animadas.includes('prata'));
check('ouro anima', animadas.includes('ouro'));
check('neon anima', animadas.includes('neon'));
check('holografica anima', animadas.includes('holografica'));
check('sakura anima', animadas.includes('sakura'));

console.log('\n=== Toda moldura animada tem efeito implementado ===');
const efeitosMatch = src.match(/const EFEITOS = \{([^}]+)\}/);
const efeitos = efeitosMatch
    ? efeitosMatch[1].split(',').map((l) => l.split(':')[0].trim()).filter(Boolean)
    : [];
const semEfeito = animadas.filter((m) => !efeitos.includes(m));
check('nenhuma moldura animada ficou sem função de desenho', semEfeito.length === 0,
    semEfeito.length ? `-> faltam: ${semEfeito.join(', ')}` : '');

console.log('\n=== Animações fecham o ciclo (sem pulo ao repetir) ===');
// Replicamos as fórmulas de ciclo usadas no animador. Se o valor em t=0 e
// em t=1 for o mesmo, o GIF repete sem salto.
const quaseIgual = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

const pulsoNeon = (t) => 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
check('neon: pulso volta ao início', quaseIgual(pulsoNeon(0), pulsoNeon(1)));

const anguloOuro = (t) => Math.cos(t * Math.PI * 2);
check('ouro: brilho dá uma volta completa', quaseIgual(anguloOuro(0), anguloOuro(1)));

const ciclaPetala = (fase, t) => (fase + t) % 1;
check('sakura: pétala reaparece no topo', quaseIgual(ciclaPetala(0.3, 0), ciclaPetala(0.3, 1)));

let petalasNoRange = true;
for (const fase of [0, 0.25, 0.5, 0.75, 0.99]) {
    for (let i = 0; i <= 16; i++) {
        const v = ciclaPetala(fase, i / 16);
        if (v < 0 || v >= 1) petalasNoRange = false;
    }
}
check('sakura: progresso sempre entre 0 e 1', petalasNoRange);

console.log('\n=== Configurações têm limites sãos ===');
const framesPadrao = Number((src.match(/CARD_GIF_FRAMES\) > 0 \? Number\(process\.env\.CARD_GIF_FRAMES\) : (\d+)/) || [])[1]);
const larguraPadrao = Number((src.match(/CARD_GIF_WIDTH\) > 0 \? Number\(process\.env\.CARD_GIF_WIDTH\) : (\d+)/) || [])[1]);
check('quadros padrão entre 8 e 32', framesPadrao >= 8 && framesPadrao <= 32, `(${framesPadrao})`);
check('largura do GIF menor que o PNG de 500px', larguraPadrao > 0 && larguraPadrao < 500, `(${larguraPadrao}px)`);
check('proporção do GIF mantém 5:7', src.includes('GIF_W * 1.4'));

console.log('\n=== Encoder é opcional (bot não pode cair sem ele) ===');
check('require do encoder está dentro da função, não no topo',
    !/^const GIFEncoder = require/m.test(src) && src.includes("require('gif-encoder-2')"));

const rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'Commands', 'utils', 'cardRenderer.js'), 'utf8');
check('renderer trata MODULE_NOT_FOUND e cai para PNG',
    rendererSrc.includes('MODULE_NOT_FOUND') && rendererSrc.includes('cardImage.png'));
check('renderer tem timeout para não travar a interação',
    rendererSrc.includes('TIMEOUT_GIF'));

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DO ANIMADOR PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
