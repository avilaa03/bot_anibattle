const User = require('./userSchema');
const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * Missões diárias e semanais.
 *
 * A ideia é transformar uma sessão de 2 minutos ("dei meu roll, fui")
 * numa de 15 ("faltam 2 batalhas para fechar a missão"). São elas que
 * dão motivo para o jogador usar os comandos que ele normalmente
 * ignoraria.
 *
 * As missões são sorteadas por jogador e trocam sozinhas quando o dia
 * (ou a semana) vira.
 *
 * Igual às conquistas: o catálogo guarda só a mecânica (evento, alvo,
 * recompensa). Nome e descrição saem de `missoes_catalogo.<chave>` no
 * dicionário — passe a missão por `localizar()` antes de exibir.
 */

const CATALOGO_DIARIAS = [
    { chave: 'rolar_3', evento: 'roll', alvo: 3, recompensa: 300 },
    { chave: 'rolar_5', evento: 'roll', alvo: 5, recompensa: 500 },
    { chave: 'vencer_1', evento: 'vitoria', alvo: 1, recompensa: 400 },
    { chave: 'vencer_3', evento: 'vitoria', alvo: 3, recompensa: 900 },
    { chave: 'batalhar_2', evento: 'batalha', alvo: 2, recompensa: 350 },
    { chave: 'descobrir_1', evento: 'descoberta', alvo: 1, recompensa: 500 },
    { chave: 'vender_1', evento: 'venda', alvo: 1, recompensa: 300 },
    { chave: 'mostrar_1', evento: 'consulta', alvo: 1, recompensa: 150 },
    { chave: 'critico_5', evento: 'critico', alvo: 5, recompensa: 450 }
];

const CATALOGO_SEMANAIS = [
    { chave: 'sem_rolar_20', evento: 'roll', alvo: 20, recompensa: 2500 },
    { chave: 'sem_vencer_10', evento: 'vitoria', alvo: 10, recompensa: 3500 },
    { chave: 'sem_descobrir_10', evento: 'descoberta', alvo: 10, recompensa: 4000 },
    { chave: 'sem_trocar_2', evento: 'troca', alvo: 2, recompensa: 3000 },
    { chave: 'sem_mercado_3', evento: 'mercado', alvo: 3, recompensa: 2800 },
    { chave: 'sem_diario_5', evento: 'diario', alvo: 5, recompensa: 3200 }
];

/** Devolve a missão com `nome` e `descricao` no idioma pedido. */
function localizar(missao, locale = DEFAULT_LOCALE) {
    if (!missao) return null;
    return {
        ...missao,
        nome: traduzir(locale, `missoes_catalogo.${missao.chave}.nome`),
        descricao: traduzir(locale, `missoes_catalogo.${missao.chave}.descricao`)
    };
}

const QTD_DIARIAS = 3;
const QTD_SEMANAIS = 2;

/** 'AAAA-MM-DD' no fuso do servidor. */
function chaveDoDia(data = new Date()) {
    return data.toISOString().slice(0, 10);
}

/** 'AAAA-Wnn' — semana ISO, para as missões semanais virarem na segunda. */
function chaveDaSemana(data = new Date()) {
    const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
    const dia = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dia);
    const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const semana = Math.ceil(((d - inicioAno) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

/** Sorteio estável por jogador+período: o mesmo jogador vê as mesmas
 * missões o dia inteiro, mas jogadores diferentes veem missões diferentes. */
function sortearEstavel(catalogo, quantidade, semente) {
    let hash = 0;
    for (let i = 0; i < semente.length; i++) {
        hash = (hash * 31 + semente.charCodeAt(i)) >>> 0;
    }
    const disponiveis = [...catalogo];
    const escolhidas = [];
    for (let i = 0; i < quantidade && disponiveis.length > 0; i++) {
        hash = (hash * 1103515245 + 12345) >>> 0;
        const indice = hash % disponiveis.length;
        escolhidas.push(disponiveis.splice(indice, 1)[0]);
    }
    return escolhidas;
}

function montarMissoes(catalogo, quantidade, semente) {
    return sortearEstavel(catalogo, quantidade, semente).map((m) => ({
        chave: m.chave,
        progresso: 0,
        alvo: m.alvo,
        resgatada: false
    }));
}

function definicao(chave) {
    return [...CATALOGO_DIARIAS, ...CATALOGO_SEMANAIS].find((m) => m.chave === chave) || null;
}

/**
 * Garante que o jogador tem missões válidas para o período atual.
 * Se o dia (ou a semana) virou, sorteia novas.
 */
async function garantirMissoes(userId) {
    const user = await User.findOne({ id: userId });
    if (!user) return null;

    const hoje = chaveDoDia();
    const semana = chaveDaSemana();
    let mudou = false;

    if (!user.missoes) user.missoes = {};

    if (user.missoes.diaGerado !== hoje) {
        user.missoes.diarias = montarMissoes(CATALOGO_DIARIAS, QTD_DIARIAS, `${userId}:${hoje}`);
        user.missoes.diaGerado = hoje;
        mudou = true;
    }
    if (user.missoes.semanaGerada !== semana) {
        user.missoes.semanais = montarMissoes(CATALOGO_SEMANAIS, QTD_SEMANAIS, `${userId}:${semana}`);
        user.missoes.semanaGerada = semana;
        mudou = true;
    }

    if (mudou) await user.save();
    return user;
}

/**
 * Avança o progresso das missões cujo evento casa.
 *
 * @param {string} userId
 * @param {string[]} eventos ex: ['roll', 'descoberta']
 * @returns {Promise<Array>} missões que ficaram completas agora
 */
async function progredir(userId, eventos) {
    if (!eventos || eventos.length === 0) return [];

    const user = await garantirMissoes(userId);
    if (!user) return [];

    const completadasAgora = [];
    let mudou = false;

    for (const grupo of ['diarias', 'semanais']) {
        for (const missao of user.missoes[grupo] || []) {
            const def = definicao(missao.chave);
            if (!def || !eventos.includes(def.evento)) continue;
            if (missao.progresso >= missao.alvo) continue;

            // Conta quantas vezes o evento veio (ex: vencer 2 rodadas).
            const vezes = eventos.filter((e) => e === def.evento).length;
            missao.progresso = Math.min(missao.alvo, missao.progresso + vezes);
            mudou = true;

            if (missao.progresso >= missao.alvo) {
                completadasAgora.push({ ...def, grupo });
            }
        }
    }

    if (mudou) await user.save();
    return completadasAgora;
}

/** Missões do jogador com a definição já anexada, prontas para exibir. */
async function listar(userId) {
    const user = await garantirMissoes(userId);
    if (!user) return { diarias: [], semanais: [] };

    const enriquecer = (lista) => (lista || []).map((m) => ({
        ...(m.toObject ? m.toObject() : m),
        def: definicao(m.chave)
    })).filter((m) => m.def);

    return {
        diarias: enriquecer(user.missoes?.diarias),
        semanais: enriquecer(user.missoes?.semanais)
    };
}

/**
 * Resgata as recompensas das missões completas ainda não resgatadas.
 * @returns {Promise<{total: number, resgatadas: Array}>}
 */
async function resgatar(userId) {
    const user = await garantirMissoes(userId);
    if (!user) return { total: 0, resgatadas: [] };

    let total = 0;
    const resgatadas = [];

    for (const grupo of ['diarias', 'semanais']) {
        for (const missao of user.missoes[grupo] || []) {
            if (missao.resgatada || missao.progresso < missao.alvo) continue;
            const def = definicao(missao.chave);
            if (!def) continue;

            missao.resgatada = true;
            total += def.recompensa;
            resgatadas.push({ ...def, grupo });
        }
    }

    if (total > 0) {
        user.balance = (user.balance || 0) + total;
        user.stats.moedasGanhas = (user.stats?.moedasGanhas || 0) + total;
        await user.save();
    }

    return { total, resgatadas };
}

module.exports = {
    CATALOGO_DIARIAS,
    CATALOGO_SEMANAIS,
    localizar,
    chaveDoDia,
    chaveDaSemana,
    definicao,
    garantirMissoes,
    progredir,
    listar,
    resgatar
};
