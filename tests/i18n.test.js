/**
 * Testes do sistema de idiomas.
 *
 * O teste que mais importa aqui é o de paridade: uma chave que existe em
 * português e falta em inglês não quebra nada em produção — ela
 * silenciosamente cai no português, e o jogador em inglês vê uma frase
 * solta em português no meio da tela. É o tipo de erro que só aparece
 * quando um usuário reclama. Aqui ele aparece no CI.
 */

const path = require('path');
const RAIZ = path.join(__dirname, '..');
const UTILS = path.join(RAIZ, 'Commands', 'utils');

const i18n = require(path.join(UTILS, 'i18n.js'));
const ui = require(path.join(UTILS, 'embeds.js'));
const achievements = require(path.join(UTILS, 'achievements.js'));
const missoes = require(path.join(UTILS, 'missoes.js'));
const vip = require(path.join(UTILS, 'vip.js'));
const elo = require(path.join(UTILS, 'elo.js'));

let falhas = 0;
function check(nome, condicao, detalhe = '') {
    if (condicao) {
        console.log(`  OK   ${nome} ${detalhe}`);
    } else {
        console.log(`  FALHOU ${nome} ${detalhe}`);
        falhas++;
    }
}

const pt = require(path.join(RAIZ, 'Commands', 'locales', 'pt-BR.json'));
const en = require(path.join(RAIZ, 'Commands', 'locales', 'en-US.json'));

function chaves(objeto, prefixo = '') {
    let saida = [];
    for (const chave of Object.keys(objeto)) {
        const valor = objeto[chave];
        const caminho = prefixo ? `${prefixo}.${chave}` : chave;
        if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
            saida = saida.concat(chaves(valor, caminho));
        } else {
            saida.push(caminho);
        }
    }
    return saida;
}

console.log('\n=== Paridade entre os dois idiomas ===');
const chavesPt = new Set(chaves(pt));
const chavesEn = new Set(chaves(en));
const faltandoEn = [...chavesPt].filter((c) => !chavesEn.has(c));
const faltandoPt = [...chavesEn].filter((c) => !chavesPt.has(c));

check('nenhuma chave faltando em en-US', faltandoEn.length === 0,
    faltandoEn.length ? `(${faltandoEn.slice(0, 5).join(', ')}...)` : `(${chavesPt.size} chaves)`);
check('nenhuma chave sobrando em en-US', faltandoPt.length === 0,
    faltandoPt.length ? `(${faltandoPt.slice(0, 5).join(', ')}...)` : '');

console.log('\n=== Marcadores {x} batem entre os idiomas ===');
// Um {valor} que existe só no português vira texto cru "{valor}" na tela
// em inglês. Esta checagem pega isso.
function marcadores(texto) {
    return new Set([...String(texto).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}
function pegar(objeto, caminho) {
    return caminho.split('.').reduce((atual, parte) => (atual == null ? undefined : atual[parte]), objeto);
}

const divergentes = [];
for (const chave of chavesPt) {
    if (!chavesEn.has(chave)) continue;
    const a = marcadores(pegar(pt, chave));
    const b = marcadores(pegar(en, chave));
    if (a.size !== b.size || [...a].some((m) => !b.has(m))) divergentes.push(chave);
}
check('marcadores idênticos nas duas versões', divergentes.length === 0,
    divergentes.length ? `(${divergentes.slice(0, 5).join(', ')})` : '');

console.log('\n=== Normalização de locale ===');
check('pt-BR reconhecido', i18n.normalizar('pt-BR') === 'pt-BR');
check('en-US reconhecido', i18n.normalizar('en-US') === 'en-US');
check('en-GB vira en-US', i18n.normalizar('en-GB') === 'en-US');
check('pt-PT vira pt-BR', i18n.normalizar('pt-PT') === 'pt-BR');
check('idioma desconhecido cai no padrão', i18n.normalizar('fr') === 'pt-BR');
check('nulo cai no padrão', i18n.normalizar(null) === 'pt-BR');

console.log('\n=== Tradução e interpolação ===');
check('interpola valores', i18n.traduzir('en-US', 'roll.botao_vender', { valor: '100' }) === 'Sell for 100');
check('chave inexistente devolve a própria chave',
    i18n.traduzir('pt-BR', 'nao.existe.essa') === 'nao.existe.essa');
check('t preso ao idioma expõe o locale', i18n.criarT('en-US').locale === 'en-US');

console.log('\n=== O texto realmente muda de idioma ===');
// Sem isto, um dicionário inglês copiado do português passaria em todos
// os testes acima.
const iguais = [];
for (const chave of chavesPt) {
    if (!chavesEn.has(chave)) continue;
    // Nomes próprios e rótulos que são iguais nos dois idiomas por
    // natureza (Bronze, Neon, Sakura, WebSocket...) não contam.
    if (/^(raridades|elo|conquistas\.tipos|vip_catalogo|atributos|comum\.traco)/.test(chave)) continue;
    if (pegar(pt, chave) === pegar(en, chave)) iguais.push(chave);
}
check('menos de 5% das chaves são idênticas nos dois idiomas',
    iguais.length < chavesPt.size * 0.05,
    `(${iguais.length} idênticas de ${chavesPt.size}${iguais.length ? ': ' + iguais.slice(0, 4).join(', ') : ''})`);

console.log('\n=== Formatação por idioma ===');
check('número em pt-BR usa ponto', ui.number(1234567, 'pt-BR') === '1.234.567');
check('número em en-US usa vírgula', ui.number(1234567, 'en-US') === '1,234,567');
check('siglas de atributo traduzidas',
    ui.statLines({ ATA: 1, LIF: 1, POW: 1 }, 'en-US').includes('ATK'));
check('raridade traduzida', ui.getRarity('ultra rare', 'en-US').label === 'Ultra Rare');
check('raridade em português', ui.getRarity('ultra rare', 'pt-BR').label === 'Ultra Rara');

console.log('\n=== Catálogos têm texto nos dois idiomas ===');
const semTextoConquista = achievements.todas().filter((c) => {
    const l = achievements.localizar(c, 'en-US');
    return !l.nome || l.nome.includes('.') || !l.descricao || l.descricao.includes('conquistas.');
});
check('todo troféu tem nome e descrição em inglês', semTextoConquista.length === 0,
    semTextoConquista.length ? `(${semTextoConquista.map((c) => c.chave).join(', ')})` : `(${achievements.todas().length} troféus)`);

const todasMissoes = [...missoes.CATALOGO_DIARIAS, ...missoes.CATALOGO_SEMANAIS];
const semTextoMissao = todasMissoes.filter((m) => {
    const l = missoes.localizar(m, 'en-US');
    return !l.nome || l.nome.includes('missoes_catalogo.');
});
check('toda missão tem nome em inglês', semTextoMissao.length === 0,
    semTextoMissao.length ? `(${semTextoMissao.map((m) => m.chave).join(', ')})` : `(${todasMissoes.length} missões)`);

const semNomeTier = vip.ORDEM_TIERS.filter((k) => vip.nomeTier(k, 'en-US').includes('vip_catalogo.'));
check('todo plano VIP tem nome nos dois idiomas', semNomeTier.length === 0);

const semNomeMoldura = Object.keys(vip.MOLDURAS).filter((k) => vip.localizarMoldura(k, 'en-US').nome.includes('vip_catalogo.'));
check('toda moldura tem nome nos dois idiomas', semNomeMoldura.length === 0);

check('divisões de ELO traduzem', elo.divisao(1500, 'en-US').nome === 'Platinum');
check('divisões de ELO em português', elo.divisao(1500, 'pt-BR').nome === 'Platina');

console.log('\n=== Descrições dos comandos ===');
// O Discord recusa o registro se a descrição passar de 100 caracteres —
// e a tradução costuma ser mais longa que o original.
const longas = [];
for (const chave of chavesPt) {
    if (!chave.startsWith('comandos.')) continue;
    for (const [locale, dicionario] of [['pt-BR', pt], ['en-US', en]]) {
        const texto = pegar(dicionario, chave);
        if (typeof texto === 'string' && texto.length > 100) longas.push(`${chave} (${locale}, ${texto.length})`);
    }
}
check('nenhuma descrição passa dos 100 caracteres do Discord', longas.length === 0,
    longas.length ? `(${longas.join(', ')})` : '');

// ---------------------------------------------------------------------
console.log('\n=== Toda chave usada no código existe no dicionário ===');
//
// O teste de paridade acima pega chave que existe num idioma e falta no
// outro. Ele NÃO pega o caso mais comum de todos: a chave que o código
// pede e que não existe em lugar nenhum.
//
// Esse erro não levanta exceção — `traduzir()` devolve a própria chave,
// e o jogador lê "loja.compra_concluida" no meio da tela. Foi o que mais
// apareceu ao terminar o inglês, sempre por um nome inventado onde já
// existia um no dicionário.
const fs = require('fs');

function arquivosJs(dir, saida = []) {
    for (const nome of fs.readdirSync(dir)) {
        const cheio = path.join(dir, nome);
        if (fs.statSync(cheio).isDirectory()) arquivosJs(cheio, saida);
        else if (nome.endsWith('.js')) saida.push(cheio);
    }
    return saida;
}

// t('x'), tMesa('x'), t.dados('x')... Os nomes alternativos existem porque
// uma tela pode ter duas vozes ao mesmo tempo — ver `tradeHandler.js`.
const CHAMADA = /\b(?:t|tMesa|tQuadro|tCanal|tX|tY|tOutro|tradutor)(?:\.lista|\.dados)?\(\s*'([a-zA-Z0-9_.]+)'/g;

const semTexto = [];
for (const arquivo of arquivosJs(path.join(RAIZ, 'Commands'))) {
    // Sem comentários: os cabeçalhos usam `t('roll.titulo')` como exemplo
    // de uso, e exemplo não precisa existir no dicionário.
    const codigo = fs.readFileSync(arquivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    const vistas = new Set();
    let m;
    while ((m = CHAMADA.exec(codigo)) !== null) vistas.add(m[1]);

    for (const chave of vistas) {
        const faltaPt = pegar(pt, chave) === undefined;
        const faltaEn = pegar(en, chave) === undefined;
        if (faltaPt || faltaEn) {
            const onde = faltaPt && faltaEn ? 'nos dois' : (faltaPt ? 'pt-BR' : 'en-US');
            semTexto.push(`${chave} (falta em ${onde}, ${path.relative(RAIZ, arquivo)})`);
        }
    }
}

check('nenhuma chave usada no código está sem texto', semTexto.length === 0,
    semTexto.length ? `\n       ${semTexto.join('\n       ')}` : '');

if (falhas > 0) {
    console.log(`\n*** ${falhas} FALHA(S) ***`);
    process.exitCode = 1;
} else {
    console.log('\n*** TODOS OS TESTES DE IDIOMA PASSARAM ***');
}
