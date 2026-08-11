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

/**
 * Os dicionários vêm da lista de `LOCALES`, não escritos aqui um a um.
 *
 * Quando o espanhol entrou, esta linha era `const en = require(...)` e a
 * paridade só conferia dois idiomas — o terceiro entraria sem rede
 * nenhuma, que é justamente quando a rede faz falta.
 */
const DICIONARIOS = Object.fromEntries(
    i18n.LOCALES.map((locale) => [locale, require(path.join(RAIZ, 'Commands', 'locales', `${locale}.json`))])
);

const PADRAO = i18n.DEFAULT_LOCALE;
const OUTROS = i18n.LOCALES.filter((l) => l !== PADRAO);

const pt = DICIONARIOS[PADRAO];

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

function marcadores(texto) {
    return new Set([...String(texto).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}
function pegar(objeto, caminho) {
    return caminho.split('.').reduce((atual, parte) => (atual == null ? undefined : atual[parte]), objeto);
}

console.log(`\n=== Paridade com o ${PADRAO} ===`);
const chavesPt = new Set(chaves(pt));
const chavesPorLocale = Object.fromEntries(
    i18n.LOCALES.map((locale) => [locale, new Set(chaves(DICIONARIOS[locale]))])
);

for (const locale of OUTROS) {
    const chavesDele = chavesPorLocale[locale];
    const faltando = [...chavesPt].filter((c) => !chavesDele.has(c));
    const sobrando = [...chavesDele].filter((c) => !chavesPt.has(c));

    check(`nenhuma chave faltando em ${locale}`, faltando.length === 0,
        faltando.length ? `(${faltando.slice(0, 5).join(', ')}...)` : `(${chavesPt.size} chaves)`);
    check(`nenhuma chave sobrando em ${locale}`, sobrando.length === 0,
        sobrando.length ? `(${sobrando.slice(0, 5).join(', ')}...)` : '');
}

console.log('\n=== Marcadores {x} batem entre os idiomas ===');
// Um {valor} que existe só no português vira texto cru "{valor}" na tela
// dos outros idiomas. Esta checagem pega isso.
for (const locale of OUTROS) {
    const chavesDele = chavesPorLocale[locale];
    const divergentes = [];
    for (const chave of chavesPt) {
        if (!chavesDele.has(chave)) continue;
        const a = marcadores(pegar(pt, chave));
        const b = marcadores(pegar(DICIONARIOS[locale], chave));
        if (a.size !== b.size || [...a].some((m) => !b.has(m))) divergentes.push(chave);
    }
    check(`marcadores idênticos em ${locale}`, divergentes.length === 0,
        divergentes.length ? `(${divergentes.slice(0, 5).join(', ')})` : '');
}

console.log('\n=== Listas têm o mesmo número de itens ===');
// O manual do /help é uma lista de páginas, cada uma com uma lista de
// comandos. Uma página a menos num idioma não quebra nada: o botão de
// avançar simplesmente para antes, e ninguém percebe até faltar conteúdo.
for (const locale of OUTROS) {
    const desiguais = [];
    for (const chave of chavesPt) {
        const a = pegar(pt, chave);
        if (!Array.isArray(a)) continue;
        const b = pegar(DICIONARIOS[locale], chave);
        if (!Array.isArray(b) || a.length !== b.length) desiguais.push(chave);
    }
    check(`listas com o mesmo tamanho em ${locale}`, desiguais.length === 0,
        desiguais.length ? `(${desiguais.join(', ')})` : '');
}

console.log('\n=== Normalização de locale ===');
check('pt-BR reconhecido', i18n.normalizar('pt-BR') === 'pt-BR');
check('en-US reconhecido', i18n.normalizar('en-US') === 'en-US');
check('es-ES reconhecido', i18n.normalizar('es-ES') === 'es-ES');
check('en-GB vira en-US', i18n.normalizar('en-GB') === 'en-US');
check('pt-PT vira pt-BR', i18n.normalizar('pt-PT') === 'pt-BR');
// O Discord manda `es-419` para o espanhol da América Latina, como código
// à parte de `es-ES`. Sem o mapa, o cliente mexicano — o maior mercado de
// língua espanhola — cairia em português com o dicionário pronto ao lado.
check('es-419 (LATAM) vira es-ES', i18n.normalizar('es-419') === 'es-ES',
    '<- sem isto o maior mercado hispanofalante não vê o espanhol');
check('es-MX vira es-ES pela base', i18n.normalizar('es-MX') === 'es-ES');
check('idioma desconhecido cai no padrão', i18n.normalizar('fr') === 'pt-BR');
check('nulo cai no padrão', i18n.normalizar(null) === 'pt-BR');

console.log('\n=== Todo idioma suportado tem dicionário e formatação ===');
// Acrescentar um locale ao i18n.js sem acrescentar o mapa de número em
// embeds.js faz `toLocaleString(undefined)` cair no locale do SERVIDOR —
// que em produção é o do container, não o do jogador.
for (const locale of i18n.LOCALES) {
    check(`${locale} formata número`, /\d/.test(ui.number(1234567, locale)),
        `(${ui.number(1234567, locale)})`);
}
check('cada idioma formata o milhar do seu jeito',
    new Set(i18n.LOCALES.map((l) => ui.number(1234567, l))).size >= 2);

console.log('\n=== Tradução e interpolação ===');
check('interpola valores', i18n.traduzir('en-US', 'roll.botao_vender', { valor: '100' }) === 'Sell for 100');
check('chave inexistente devolve a própria chave',
    i18n.traduzir('pt-BR', 'nao.existe.essa') === 'nao.existe.essa');
check('t preso ao idioma expõe o locale', i18n.criarT('en-US').locale === 'en-US');

console.log('\n=== O texto realmente muda de idioma ===');
// Sem isto, um dicionário copiado do português passaria em todos os
// testes acima — tem as mesmas chaves, os mesmos marcadores e o mesmo
// número de itens. É o único teste que olha o CONTEÚDO.
for (const locale of OUTROS) {
    const chavesDele = chavesPorLocale[locale];
    const iguais = [];
    for (const chave of chavesPt) {
        if (!chavesDele.has(chave)) continue;
        // Nomes próprios e rótulos que são iguais por natureza (Bronze,
        // Neon, Sakura, OVR, o travessão...) não contam.
        if (/^(raridades|elo|conquistas\.tipos|vip_catalogo|atributos|comum\.traco)/.test(chave)) continue;
        if (pegar(pt, chave) === pegar(DICIONARIOS[locale], chave)) iguais.push(chave);
    }
    // O espanhol tem folga maior: ele é próximo do português de verdade, e
    // "Bronce"/"Total"/"Normal" coincidirem não é sinal de dicionário
    // copiado. O inglês, não — ali coincidir é suspeito.
    const teto = locale === 'es-ES' ? 0.12 : 0.05;
    check(`menos de ${Math.round(teto * 100)}% das chaves são idênticas ao ${PADRAO} em ${locale}`,
        iguais.length < chavesPt.size * teto,
        `(${iguais.length} idênticas de ${chavesPt.size}${iguais.length ? ': ' + iguais.slice(0, 4).join(', ') : ''})`);
}

console.log('\n=== Formatação por idioma ===');
check('número em pt-BR usa ponto', ui.number(1234567, 'pt-BR') === '1.234.567');
check('número em en-US usa vírgula', ui.number(1234567, 'en-US') === '1,234,567');
check('siglas de atributo traduzidas',
    ui.statLines({ ATA: 1, LIF: 1, POW: 1 }, 'en-US').includes('ATK'));
check('raridade traduzida', ui.getRarity('ultra rare', 'en-US').label === 'Ultra Rare');
check('raridade em português', ui.getRarity('ultra rare', 'pt-BR').label === 'Ultra Rara');

console.log('\n=== Catálogos têm texto em todos os idiomas ===');
//
// Estes catálogos guardam só mecânica: chave, condição e valores. O nome
// e a descrição vêm do dicionário, e uma chave sem texto volta como o
// próprio caminho (`conquistas.primeira_carta.nome`) — feio na tela, mas
// sem erro nenhum no log. É o que estes testes procuram.
const itens = require(path.join(UTILS, 'itens.js'));
const caixas = require(path.join(UTILS, 'caixas.js'));
const treino = require(path.join(UTILS, 'treino.js'));

for (const locale of i18n.LOCALES) {
    const semTextoConquista = achievements.todas().filter((c) => {
        const l = achievements.localizar(c, locale);
        return !l.nome || l.nome.includes('conquistas.') || !l.descricao || l.descricao.includes('conquistas.');
    });
    check(`todo troféu tem nome e descrição em ${locale}`, semTextoConquista.length === 0,
        semTextoConquista.length ? `(${semTextoConquista.map((c) => c.chave).join(', ')})` : `(${achievements.todas().length} troféus)`);

    const todasMissoes = [...missoes.CATALOGO_DIARIAS, ...missoes.CATALOGO_SEMANAIS];
    const semTextoMissao = todasMissoes.filter((m) => {
        const l = missoes.localizar(m, locale);
        return !l.nome || l.nome.includes('missoes_catalogo.');
    });
    check(`toda missão tem nome em ${locale}`, semTextoMissao.length === 0,
        semTextoMissao.length ? `(${semTextoMissao.map((m) => m.chave).join(', ')})` : `(${todasMissoes.length} missões)`);

    const semNomeTier = vip.ORDEM_TIERS.filter((k) => vip.nomeTier(k, locale).includes('vip_catalogo.'));
    check(`todo plano VIP tem nome em ${locale}`, semNomeTier.length === 0);

    const semNomeMoldura = Object.keys(vip.MOLDURAS)
        .filter((k) => vip.localizarMoldura(k, locale).nome.includes('vip_catalogo.'));
    check(`toda moldura tem nome em ${locale}`, semNomeMoldura.length === 0);

    const semNomeItem = Object.keys(itens.ITENS)
        .filter((k) => itens.localizarPorChave(k, locale).nome.includes('itens_catalogo.'));
    check(`todo item tem nome em ${locale}`, semNomeItem.length === 0,
        semNomeItem.length ? `(${semNomeItem.join(', ')})` : '');

    const semNomeCaixa = Object.keys(caixas.CAIXAS)
        .filter((k) => caixas.localizarPorChave(k, locale).nome.includes('caixas_catalogo.'));
    check(`toda caixa tem nome em ${locale}`, semNomeCaixa.length === 0,
        semNomeCaixa.length ? `(${semNomeCaixa.join(', ')})` : '');

    const semNomeDificuldade = Object.keys(treino.DIFICULDADES)
        .filter((k) => treino.localizarDificuldade(k, locale).nome.includes('treino_catalogo.'));
    check(`toda dificuldade de treino tem nome em ${locale}`, semNomeDificuldade.length === 0,
        semNomeDificuldade.length ? `(${semNomeDificuldade.join(', ')})` : '');

    check(`divisões de ELO traduzem em ${locale}`, !elo.divisao(1500, locale).nome.includes('elo.'));
}

check('divisões de ELO traduzem', elo.divisao(1500, 'en-US').nome === 'Platinum');
check('divisões de ELO em português', elo.divisao(1500, 'pt-BR').nome === 'Platina');
check('divisões de ELO em espanhol', elo.divisao(1500, 'es-ES').nome === 'Platino');

console.log('\n=== Descrições dos comandos ===');
// O Discord recusa o registro se a descrição passar de 100 caracteres —
// e a tradução costuma ser mais longa que o original.
const longas = [];
for (const chave of chavesPt) {
    if (!chave.startsWith('comandos.')) continue;
    for (const [locale, dicionario] of Object.entries(DICIONARIOS)) {
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
//
// `descricaoBase`, `localizacoes` e `escolha` entram na mesma varredura, e
// não é detalhe: eles são o caminho das descrições de slash command, que
// nem sequer aparecem numa tela do bot — aparecem na lista de comandos do
// Discord. Sem eles aqui, cinco chaves quebradas passaram pelo teste e
// teriam ido para produção como `comandos.roll.opcao_extra` cru.
const CHAMADA = new RegExp(
    '\\b(?:t|tMesa|tQuadro|tCanal|tX|tY|tOutro|tradutor)(?:\\.lista|\\.dados)?\\(\\s*\'([a-zA-Z0-9_.]+)\''
    + '|\\b(?:descricaoBase|localizacoes|escolha)\\(\\s*\'([a-zA-Z0-9_.]+)\'',
    'g'
);

const semTexto = [];
for (const arquivo of arquivosJs(path.join(RAIZ, 'Commands'))) {
    // Sem comentários: os cabeçalhos usam `t('roll.titulo')` como exemplo
    // de uso, e exemplo não precisa existir no dicionário.
    const codigo = fs.readFileSync(arquivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    const vistas = new Set();
    let m;
    // O grupo 1 é a família do `t(...)`; o 2 é a das descrições de comando.
    while ((m = CHAMADA.exec(codigo)) !== null) vistas.add(m[1] ?? m[2]);

    for (const chave of vistas) {
        const faltaEm = i18n.LOCALES.filter((l) => pegar(DICIONARIOS[l], chave) === undefined);
        if (faltaEm.length > 0) {
            const onde = faltaEm.length === i18n.LOCALES.length ? 'em todos' : `em ${faltaEm.join(', ')}`;
            semTexto.push(`${chave} (falta ${onde}, ${path.relative(RAIZ, arquivo)})`);
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
