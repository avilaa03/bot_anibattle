/**
 * Decide em que idioma o bot responde a uma interação.
 *
 * Ordem de precedência, do mais específico para o mais genérico:
 *
 *   1. preferência do jogador  (/idioma escopo:mim)
 *   2. padrão do servidor      (/idioma escopo:servidor, só admin)
 *   3. idioma do cliente Discord de quem clicou (interaction.locale)
 *   4. português
 *
 * O jogador vence o servidor de propósito: num servidor brasileiro com um
 * gringo dentro, quem precisa do inglês é uma pessoa só — e obrigar o
 * servidor inteiro a mudar para atender essa pessoa seria pior.
 *
 * O passo 3 é o que faz o bot já chegar em inglês para quem usa o Discord
 * em inglês, sem ninguém configurar nada.
 */

const Guild = require('./guildSchema');
const User = require('./userSchema');
const { normalizar, criarT, DEFAULT_LOCALE } = require('./i18n');

// Resolver idioma não pode custar uma consulta ao banco por clique de
// botão. Estes caches guardam só o campo `idioma` e são invalidados na
// hora em que o /idioma grava — então não existe janela em que o jogador
// troque o idioma e continue vendo o antigo.
const TTL_MS = 10 * 60 * 1000;
const cacheServidor = new Map(); // guildId -> { valor, expiraEm }
const cacheUsuario = new Map();  // userId  -> { valor, expiraEm }

function lerCache(cache, chave) {
    const entrada = cache.get(chave);
    if (!entrada) return undefined;
    if (Date.now() > entrada.expiraEm) {
        cache.delete(chave);
        return undefined;
    }
    return entrada.valor;
}

function gravarCache(cache, chave, valor) {
    cache.set(chave, { valor, expiraEm: Date.now() + TTL_MS });
}

/** Chamado pelo /idioma logo depois de salvar, para o efeito ser imediato. */
function invalidarServidor(guildId) {
    cacheServidor.delete(guildId);
}

function invalidarUsuario(userId) {
    cacheUsuario.delete(userId);
}

async function idiomaDoServidor(guildId) {
    if (!guildId) return null;

    const emCache = lerCache(cacheServidor, guildId);
    if (emCache !== undefined) return emCache;

    let valor = null;
    try {
        const doc = await Guild.findOne({ guildId }).select('idioma').lean();
        valor = doc?.idioma || null;
    } catch {
        // Banco fora do ar não pode derrubar o comando: cai no padrão.
        valor = null;
    }

    gravarCache(cacheServidor, guildId, valor);
    return valor;
}

async function idiomaDoUsuario(userId) {
    if (!userId) return null;

    const emCache = lerCache(cacheUsuario, userId);
    if (emCache !== undefined) return emCache;

    let valor = null;
    try {
        const doc = await User.findOne({ id: userId }).select('idioma').lean();
        valor = doc?.idioma || null;
    } catch {
        valor = null;
    }

    gravarCache(cacheUsuario, userId, valor);
    return valor;
}

/** Resolve o locale de uma interação (chat command, botão ou menu). */
async function resolverIdioma(interaction) {
    if (!interaction) return DEFAULT_LOCALE;

    const doUsuario = await idiomaDoUsuario(interaction.user?.id);
    if (doUsuario) return normalizar(doUsuario);

    const doServidor = await idiomaDoServidor(interaction.guildId);
    if (doServidor) return normalizar(doServidor);

    // `interaction.locale` é o idioma do cliente Discord de quem clicou.
    // Em DM é o único sinal que existe.
    return normalizar(interaction.locale, DEFAULT_LOCALE);
}

/**
 * Atalho usado no começo de todo comando:
 *
 *   const t = await tDaInteracao(interaction);
 *   t('roll.titulo', { nome: card.name })
 */
async function tDaInteracao(interaction) {
    return criarT(await resolverIdioma(interaction));
}

/**
 * Idioma de um jogador que NÃO clicou em nada.
 *
 * Serve para mensagem enviada por iniciativa do bot: a DM de montar o
 * time numa batalha, o aviso de troca aceita, o resultado do torneio.
 * Nesses casos não existe `interaction.locale` do destinatário — só a
 * preferência dele e a do servidor onde a coisa aconteceu.
 *
 * Sem isto, os dois lados de um duelo receberiam a DM no idioma de quem
 * abriu o desafio, que é justamente o caso que o /idioma por jogador
 * existe para resolver.
 */
async function tDoUsuario(userId, guildId = null) {
    const doUsuario = await idiomaDoUsuario(userId);
    if (doUsuario) return criarT(doUsuario);

    const doServidor = await idiomaDoServidor(guildId);
    if (doServidor) return criarT(doServidor);

    return criarT(DEFAULT_LOCALE);
}

module.exports = {
    resolverIdioma,
    tDaInteracao,
    tDoUsuario,
    idiomaDoServidor,
    idiomaDoUsuario,
    invalidarServidor,
    invalidarUsuario
};
