/**
 * Nomes de comando, subcomando e opção.
 *
 * ## As duas coisas que este arquivo protege
 *
 * **1. O canônico é inglês.** O bot é usado em três idiomas, e o nome que
 * aparece no código, nos logs e na documentação técnica precisa ser um só.
 *
 * **2. O apelido `pt-BR` é exatamente o nome antigo.** Ele não é uma
 * tradução: é compatibilidade. Quem jogava digitando `/bolsa` continua
 * digitando `/bolsa`. Trocar esse apelido por um português melhor
 * quebraria a memória de quem já joga — sem erro nenhum, o comando
 * simplesmente deixaria de existir para ele.
 *
 * Por isso a lista de nomes antigos abaixo é CONGELADA. Ela é um registro
 * histórico do que existia antes da padronização, não uma configuração:
 * mexer nela é o mesmo que dizer "tudo bem quebrar esse jogador".
 */

const path = require('path');
const RAIZ = path.join(__dirname, '..');
const UTILS = path.join(RAIZ, 'Commands', 'utils');

const nomes = require(path.join(UTILS, 'commandNames.js'));
const i18n = require(path.join(UTILS, 'i18n.js'));

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
 * Os nomes que os comandos tinham antes da padronização.
 *
 * NÃO MEXER. Ver o cabeçalho.
 */
const NOMES_ANTIGOS = {
    upgrade: 'aprimorar',
    bag: 'bolsa',
    box: 'caixa',
    collectors: 'colecionadores',
    achievements: 'conquistas',
    cosmetics: 'cosmeticos',
    wish: 'desejar',
    wishlist: 'desejos',
    salvage: 'desmanchar',
    event: 'evento',
    cardinfo: 'ficha',
    language: 'idioma',
    shop: 'loja',
    tycoon: 'magnata',
    missions: 'missoes',
    tournament: 'torneio',
    training: 'treino',
    trade: 'trocar'
};

console.log('\n=== O apelido pt-BR preserva o nome antigo ===');
for (const [canonico, antigo] of Object.entries(NOMES_ANTIGOS)) {
    const apelido = nomes.comando(canonico)['pt-BR'];
    check(`/${antigo} continua funcionando (hoje /${canonico})`, apelido === antigo,
        apelido === antigo ? '' : `<- apelido é "${apelido}", devia ser "${antigo}"`);
}

check('todo comando renomeado está no mapa',
    Object.keys(NOMES_ANTIGOS).every((c) => nomes.COMANDOS[c]),
    '<- comando fora do mapa perde o apelido e quebra quem já jogava');

check('o mapa não tem comando a mais do que a lista congelada',
    Object.keys(nomes.COMANDOS).every((c) => NOMES_ANTIGOS[c]),
    `(${Object.keys(nomes.COMANDOS).filter((c) => !NOMES_ANTIGOS[c]).join(', ')})`);

console.log('\n=== Nenhum nome canônico ficou em português ===');
//
// A lista é de palavras que só existem em português. Um nome novo em
// português passa a ser pego aqui, e não seis meses depois quando alguém
// reparar que `/loja` voltou.
const PALAVRAS_PT = [
    'aprimorar', 'bolsa', 'caixa', 'colecionadores', 'conquistas', 'cosmeticos',
    'desejar', 'desejos', 'desmanchar', 'evento', 'ficha', 'idioma', 'loja',
    'magnata', 'missoes', 'torneio', 'treino', 'trocar', 'nome', 'quantidade',
    'serie', 'raridade', 'escopo', 'dificuldade', 'aposta', 'vagas',
    'inscricao', 'numero', 'remover', 'faltantes', 'ver', 'comprar', 'abrir',
    'lista', 'entrar'
];

const canonicos = [
    ...Object.keys(nomes.COMANDOS),
    ...Object.keys(nomes.SUBCOMANDOS).map((k) => k.split('.')[1]),
    ...Object.keys(nomes.OPCOES)
];
const emPortugues = canonicos.filter((n) => PALAVRAS_PT.includes(n));
check('nenhum nome canônico é palavra em português', emPortugues.length === 0,
    emPortugues.length ? `(${[...new Set(emPortugues)].join(', ')})` : `(${canonicos.length} nomes)`);

console.log('\n=== Os apelidos são válidos para o Discord ===');
//
// A API recusa o registro inteiro se UM nome for inválido — e o bot sobe
// sem comando nenhum. O padrão é minúsculo, 1 a 32 caracteres, sem espaço.
const VALIDO = /^[-_a-z0-9à-ÿ]{1,32}$/;
const invalidos = [];
for (const mapa of [nomes.COMANDOS, nomes.SUBCOMANDOS, nomes.OPCOES]) {
    for (const [chave, apelidos] of Object.entries(mapa)) {
        for (const [locale, apelido] of Object.entries(apelidos)) {
            if (!VALIDO.test(apelido)) invalidos.push(`${chave}/${locale}="${apelido}"`);
        }
    }
}
check('todo apelido casa com o padrão do Discord', invalidos.length === 0,
    invalidos.length ? `(${invalidos.join(', ')})` : '');

console.log('\n=== Todo idioma suportado tem apelido ===');
//
// Um idioma sem apelido não é erro — ele simplesmente vê o nome canônico.
// Mas se o pt-BR ou o es-ES sumirem de uma entrada, é esquecimento.
const semApelido = [];
for (const [chave, apelidos] of Object.entries(nomes.COMANDOS)) {
    for (const locale of i18n.LOCALES) {
        if (locale === i18n.DEFAULT_LOCALE || locale === 'en-US') continue;
        if (!apelidos[locale]) semApelido.push(`${chave} (${locale})`);
    }
    if (!apelidos[i18n.DEFAULT_LOCALE]) semApelido.push(`${chave} (${i18n.DEFAULT_LOCALE})`);
}
check('todo comando tem apelido em todos os idiomas não ingleses', semApelido.length === 0,
    semApelido.length ? `(${semApelido.join(', ')})` : '');

console.log('\n=== nomeNoIdioma devolve o que o jogador digita ===');
check('em português', nomes.nomeNoIdioma('bag', 'pt-BR') === 'bolsa');
check('em espanhol', nomes.nomeNoIdioma('shop', 'es-ES') === 'tienda');
check('em inglês cai no canônico', nomes.nomeNoIdioma('bag', 'en-US') === 'bag');
check('comando sem apelido devolve o próprio nome', nomes.nomeNoIdioma('roll', 'pt-BR') === 'roll');

if (falhas > 0) {
    console.log(`\n*** ${falhas} FALHA(S) ***`);
    process.exitCode = 1;
} else {
    console.log('\n*** TODOS OS TESTES DE NOMES PASSARAM ***');
}
