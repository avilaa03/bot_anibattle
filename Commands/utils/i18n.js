/**
 * Tradução das respostas do bot.
 *
 * Regra da casa: nenhum comando escreve texto para o jogador na mão. Tudo
 * sai de `Commands/locales/<locale>.json` através de `t(chave, valores)`.
 *
 * O idioma nunca é global — é resolvido por interação (veja `idioma.js`),
 * porque dois jogadores no mesmo servidor podem estar em idiomas
 * diferentes, e o mesmo processo do bot atende os dois ao mesmo tempo.
 */

const ptBR = require('../locales/pt-BR.json');
const enUS = require('../locales/en-US.json');
const esES = require('../locales/es-ES.json');

const DEFAULT_LOCALE = 'pt-BR';

// Chave interna -> dicionário. As chaves seguem os códigos do Discord, para
// dar para repassar direto em setDescriptionLocalizations().
const DICIONARIOS = {
    'pt-BR': ptBR,
    'en-US': enUS,
    'es-ES': esES
};

const LOCALES = Object.keys(DICIONARIOS);

/**
 * Códigos que o Discord manda em `interaction.locale` e para onde cada um
 * cai. O que não estiver aqui vira inglês: é o palpite menos errado para
 * quem não fala português.
 *
 * `es-419` é o espanhol da América Latina, e o Discord o manda como um
 * código à parte de `es-ES`. Sem esta linha, o cliente mexicano — o maior
 * mercado de língua espanhola — cairia em inglês mesmo com o dicionário
 * espanhol pronto e carregado.
 */
const MAPA_DISCORD = {
    'pt-BR': 'pt-BR',
    'en-US': 'en-US',
    'en-GB': 'en-US',
    'es-ES': 'es-ES',
    'es-419': 'es-ES'
};

/** Normaliza qualquer coisa (código do Discord, string solta, null) num locale suportado. */
function normalizar(locale, padrao = DEFAULT_LOCALE) {
    if (!locale) return padrao;
    const texto = String(locale).trim();
    if (DICIONARIOS[texto]) return texto;
    if (MAPA_DISCORD[texto]) return MAPA_DISCORD[texto];
    // "en", "pt", "pt-PT", "es-MX"... — casa pelo idioma base.
    const base = texto.toLowerCase().split(/[-_]/)[0];
    if (base === 'pt') return 'pt-BR';
    if (base === 'en') return 'en-US';
    if (base === 'es') return 'es-ES';
    return padrao;
}

/** Caminho pontilhado: busca("roll.cooldown.titulo") -> dicionario.roll.cooldown.titulo */
function buscar(dicionario, chave) {
    let atual = dicionario;
    for (const parte of String(chave).split('.')) {
        if (atual == null || typeof atual !== 'object') return undefined;
        atual = atual[parte];
    }
    return atual;
}

/**
 * Substitui {marcadores} pelos valores. Marcador sem valor correspondente
 * fica como está — some no texto, mas não vira "undefined" na cara do
 * jogador.
 */
function interpolar(texto, valores) {
    if (!valores) return texto;
    return texto.replace(/\{(\w+)\}/g, (original, nome) => (
        Object.prototype.hasOwnProperty.call(valores, nome) ? String(valores[nome]) : original
    ));
}

/**
 * Traduz uma chave.
 *
 * Se faltar no idioma pedido, cai no português; se faltar nos dois,
 * devolve a própria chave. Devolver a chave é proposital: aparece feio na
 * tela e por isso é encontrado rápido, em vez de virar um texto vazio que
 * passa despercebido em produção.
 */
function traduzir(locale, chave, valores) {
    const alvo = normalizar(locale);

    let valor = buscar(DICIONARIOS[alvo], chave);
    if (valor === undefined && alvo !== DEFAULT_LOCALE) {
        valor = buscar(DICIONARIOS[DEFAULT_LOCALE], chave);
    }
    if (valor === undefined) return chave;

    // Listas viram texto com quebra de linha — é o formato que os embeds
    // usam para parágrafos e enumerações.
    if (Array.isArray(valor)) {
        return valor.map((linha) => interpolar(String(linha), valores)).join('\n');
    }
    if (typeof valor !== 'string') return chave;

    return interpolar(valor, valores);
}

/**
 * Devolve o valor CRU do dicionário, sem virar texto.
 *
 * Existe para conteúdo que é estrutura, não frase: as páginas do /help,
 * por exemplo, são uma lista de objetos com título, descrição e comandos.
 * Espremer isso em chaves soltas (`help.p1.titulo`, `help.p1.cmd1`...)
 * daria um dicionário ilegível e quebraria a cada comando novo.
 */
function dados(locale, chave) {
    const alvo = normalizar(locale);
    const valor = buscar(DICIONARIOS[alvo], chave);
    if (valor !== undefined) return valor;
    return buscar(DICIONARIOS[DEFAULT_LOCALE], chave);
}

/** Igual a traduzir(), mas devolve o array cru (para .map() no chamador). */
function traduzirLista(locale, chave, valores) {
    const alvo = normalizar(locale);
    let valor = buscar(DICIONARIOS[alvo], chave);
    if (valor === undefined && alvo !== DEFAULT_LOCALE) {
        valor = buscar(DICIONARIOS[DEFAULT_LOCALE], chave);
    }
    if (!Array.isArray(valor)) return [];
    return valor.map((linha) => interpolar(String(linha), valores));
}

/**
 * Devolve um `t` já preso a um idioma, para o comando não repetir o
 * locale em toda chamada: `const t = criarT(locale); t('roll.titulo')`.
 */
function criarT(locale) {
    const alvo = normalizar(locale);
    const t = (chave, valores) => traduzir(alvo, chave, valores);
    t.locale = alvo;
    t.lista = (chave, valores) => traduzirLista(alvo, chave, valores);
    t.dados = (chave) => dados(alvo, chave);
    return t;
}

/**
 * Monta o objeto de localizações que o Discord aceita em
 * setDescriptionLocalizations(). O português fica de fora porque já é o
 * texto base passado em setDescription().
 *
 * `valores` existe para descrição que cita um número do jogo — o limite
 * diário de rolls extras, por exemplo. O número fica no código e entra
 * por `{marcador}`; escrevê-lo no dicionário faria a frase sobreviver à
 * mudança da regra e virar mentira em silêncio, nos dois idiomas de uma
 * vez.
 */
function localizacoes(chave, valores) {
    const saida = {};
    for (const locale of LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;
        const valor = buscar(DICIONARIOS[locale], chave);
        if (typeof valor === 'string') saida[locale] = interpolar(valor, valores);
    }
    return saida;
}

/** Descrição base (pt-BR) de uma chave — o que vai em setDescription(). */
function descricaoBase(chave, valores) {
    return traduzir(DEFAULT_LOCALE, chave, valores);
}

/**
 * Uma escolha de slash command já com os dois idiomas.
 *
 * O Discord mostra `name` para quem não tem localização e
 * `name_localizations[locale]` para quem tem — a lista de opções aparece
 * traduzida na hora de digitar o comando, não só na resposta.
 */
function escolha(chave, value, prefixo = '') {
    const localizacoesNome = localizacoes(chave);
    return {
        name: `${prefixo}${traduzir(DEFAULT_LOCALE, chave)}`,
        name_localizations: Object.fromEntries(
            Object.entries(localizacoesNome).map(([locale, texto]) => [locale, `${prefixo}${texto}`])
        ),
        value
    };
}

/** As cinco raridades como escolhas prontas, com emoji. */
function escolhasRaridade() {
    return [
        escolha('raridades.common', 'common', '⚪ '),
        escolha('raridades.rare', 'rare', '🔵 '),
        escolha('raridades.ultra_rare', 'ultra rare', '🟣 '),
        escolha('raridades.legendary', 'legendary', '🟠 '),
        escolha('raridades.master', 'master', '🌟 ')
    ];
}

module.exports = {
    DEFAULT_LOCALE,
    LOCALES,
    normalizar,
    traduzir,
    traduzirLista,
    dados,
    criarT,
    localizacoes,
    descricaoBase,
    escolha,
    escolhasRaridade
};
