const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * Conquistas, no estilo dos troféus da PSN.
 *
 * 🥉 Bronze   — conquista comum, quase todo mundo pega jogando
 * 🥈 Prata    — conquista rara, exige dedicação
 * 🥇 Ouro     — conquista muito rara, exige muito tempo ou sorte
 * 💎 Platina  — a mais rara de todas: desbloqueia sozinha quando o
 *               jogador conquista TODOS os outros troféus
 *
 * A regra da platina é a mesma da PlayStation: ela não tem condição
 * própria, é o prêmio por ter 100% do resto. É o objetivo de longo prazo
 * que dá sentido a perseguir os troféus chatos.
 *
 * ## Onde estão os nomes
 *
 * O catálogo aqui só tem a mecânica: chave, tipo e condição. Nome e
 * descrição vivem em `locales/<idioma>.json`, sob `conquistas.<chave>`.
 * A chave é o que fica gravado no documento do jogador, então trocar o
 * texto de um troféu (ou traduzir) nunca mexe no que já foi conquistado.
 *
 * Use `localizar(conquista, locale)` antes de mostrar qualquer troféu.
 */

const TIPOS = {
    bronze: { chave: 'bronze', emoji: '🥉', cor: 0xCD7F32, peso: 1, pontos: 15 },
    prata: { chave: 'prata', emoji: '🥈', cor: 0xC0C0C0, peso: 2, pontos: 30 },
    ouro: { chave: 'ouro', emoji: '🥇', cor: 0xFFD700, peso: 3, pontos: 90 },
    platina: { chave: 'platina', emoji: '💎', cor: 0x5DADE2, peso: 4, pontos: 300 }
};

/**
 * Catálogo de troféus.
 *
 * `condicao(ctx)` recebe um contexto já montado (usuário + números
 * derivados) e devolve true quando está conquistado.
 * `progresso(ctx)` é opcional e serve só para mostrar barra de progresso.
 */
const CONQUISTAS = [
    // ---------- Primeiros passos (bronze) ----------
    {
        chave: 'primeira_carta',
        tipo: 'bronze',
        condicao: (c) => c.totalCartas >= 1
    },
    {
        chave: 'primeira_vitoria',
        tipo: 'bronze',
        condicao: (c) => c.stats.batalhasVencidas >= 1
    },
    {
        chave: 'primeira_venda',
        tipo: 'bronze',
        condicao: (c) => c.stats.vendasMercado >= 1
    },
    {
        chave: 'primeira_troca',
        tipo: 'bronze',
        condicao: (c) => c.stats.trocasFeitas >= 1
    },
    {
        chave: 'colecionador_10',
        tipo: 'bronze',
        condicao: (c) => c.descobertas >= 10,
        progresso: (c) => ({ atual: c.descobertas, alvo: 10 })
    },
    {
        chave: 'rico_1000',
        tipo: 'bronze',
        condicao: (c) => c.balance >= 1000,
        progresso: (c) => ({ atual: c.balance, alvo: 1000 })
    },
    {
        chave: 'streak_3',
        tipo: 'bronze',
        condicao: (c) => c.streakMaior >= 3,
        progresso: (c) => ({ atual: c.streakMaior, alvo: 3 })
    },
    {
        chave: 'primeira_rara',
        tipo: 'bronze',
        condicao: (c) => c.porRaridade.rare + c.porRaridade['ultra rare'] + c.porRaridade.legendary + c.porRaridade.master >= 1
    },
    {
        chave: 'favorita',
        tipo: 'bronze',
        condicao: (c) => Boolean(c.favCard)
    },

    // ---------- Dedicação (prata) ----------
    {
        chave: 'colecionador_100',
        tipo: 'prata',
        condicao: (c) => c.descobertas >= 100,
        progresso: (c) => ({ atual: c.descobertas, alvo: 100 })
    },
    {
        chave: 'vitorias_25',
        tipo: 'prata',
        condicao: (c) => c.stats.batalhasVencidas >= 25,
        progresso: (c) => ({ atual: c.stats.batalhasVencidas, alvo: 25 })
    },
    {
        chave: 'rico_100k',
        tipo: 'prata',
        condicao: (c) => c.balance >= 100000,
        progresso: (c) => ({ atual: c.balance, alvo: 100000 })
    },
    {
        chave: 'streak_7',
        tipo: 'prata',
        condicao: (c) => c.streakMaior >= 7,
        progresso: (c) => ({ atual: c.streakMaior, alvo: 7 })
    },
    {
        chave: 'lendaria',
        tipo: 'prata',
        condicao: (c) => c.porRaridade.legendary + c.porRaridade.master >= 1
    },
    {
        chave: 'trocas_10',
        tipo: 'prata',
        condicao: (c) => c.stats.trocasFeitas >= 10,
        progresso: (c) => ({ atual: c.stats.trocasFeitas, alvo: 10 })
    },
    {
        chave: 'serie_completa',
        tipo: 'prata',
        condicao: (c) => c.seriesCompletas >= 1,
        progresso: (c) => ({ atual: c.seriesCompletas, alvo: 1 })
    },
    {
        chave: 'criticos_50',
        tipo: 'prata',
        condicao: (c) => c.stats.criticos >= 50,
        progresso: (c) => ({ atual: c.stats.criticos, alvo: 50 })
    },
    {
        chave: 'virada',
        tipo: 'prata',
        condicao: (c) => c.stats.viradas >= 1
    },
    {
        chave: 'elo_1300',
        tipo: 'prata',
        condicao: (c) => c.picoElo >= 1300,
        progresso: (c) => ({ atual: c.picoElo, alvo: 1300 })
    },

    // ---------- Elite (ouro) ----------
    {
        chave: 'colecionador_500',
        tipo: 'ouro',
        condicao: (c) => c.descobertas >= 500,
        progresso: (c) => ({ atual: c.descobertas, alvo: 500 })
    },
    {
        chave: 'pokedex_completa',
        tipo: 'ouro',
        condicao: (c) => c.totalCatalogo > 0 && c.descobertas >= c.totalCatalogo,
        progresso: (c) => ({ atual: c.descobertas, alvo: c.totalCatalogo })
    },
    {
        chave: 'mestra',
        tipo: 'ouro',
        condicao: (c) => c.porRaridade.master >= 1
    },
    {
        chave: 'vitorias_100',
        tipo: 'ouro',
        condicao: (c) => c.stats.batalhasVencidas >= 100,
        progresso: (c) => ({ atual: c.stats.batalhasVencidas, alvo: 100 })
    },
    {
        chave: 'streak_30',
        tipo: 'ouro',
        condicao: (c) => c.streakMaior >= 30,
        progresso: (c) => ({ atual: c.streakMaior, alvo: 30 })
    },
    {
        chave: 'elo_1600',
        tipo: 'ouro',
        condicao: (c) => c.picoElo >= 1600,
        progresso: (c) => ({ atual: c.picoElo, alvo: 1600 })
    },
    {
        chave: 'torneio',
        tipo: 'ouro',
        condicao: (c) => c.stats.torneiosVencidos >= 1
    },
    {
        chave: 'deck_lendario',
        tipo: 'ouro',
        condicao: (c) => c.porRaridade.legendary + c.porRaridade.master >= 3,
        progresso: (c) => ({ atual: c.porRaridade.legendary + c.porRaridade.master, alvo: 3 })
    }
];

const PLATINA = {
    chave: 'platina',
    tipo: 'platina'
};

/** Todos os troféus, incluindo a platina. */
function todas() {
    return [...CONQUISTAS, PLATINA];
}

function porChave(chave) {
    return todas().find((c) => c.chave === chave) || null;
}

/** Nome do tipo do troféu no idioma pedido ("Prata" / "Silver"). */
function nomeTipo(tipo, locale = DEFAULT_LOCALE) {
    return traduzir(locale, `conquistas.tipos.${tipo}`);
}

/**
 * Devolve a conquista com `nome` e `descricao` já no idioma pedido.
 * Todo lugar que mostra um troféu passa por aqui.
 */
function localizar(conquista, locale = DEFAULT_LOCALE) {
    if (!conquista) return null;
    return {
        ...conquista,
        nome: traduzir(locale, `conquistas.${conquista.chave}.nome`),
        descricao: traduzir(locale, `conquistas.${conquista.chave}.descricao`)
    };
}

/** Atalho: pega pela chave já traduzida. */
function localizarPorChave(chave, locale = DEFAULT_LOCALE) {
    return localizar(porChave(chave), locale);
}

/** Quantos troféus existem de cada tipo. */
function contagemPorTipo() {
    const contagem = { bronze: 0, prata: 0, ouro: 0, platina: 1 };
    for (const c of CONQUISTAS) contagem[c.tipo]++;
    return contagem;
}

/**
 * Avalia quais troféus o jogador deveria ter, dado o contexto.
 * Não grava nada — quem grava é o progresso.js.
 *
 * @returns {string[]} chaves conquistadas
 */
function avaliar(contexto) {
    const conquistadas = CONQUISTAS
        .filter((c) => {
            try {
                return c.condicao(contexto);
            } catch (err) {
                return false;
            }
        })
        .map((c) => c.chave);

    // Platina: só quando TODAS as outras estiverem conquistadas.
    if (conquistadas.length === CONQUISTAS.length) {
        conquistadas.push(PLATINA.chave);
    }

    return conquistadas;
}

/** Soma de pontos dos troféus de um jogador (estilo "nível de troféu"). */
function pontos(chaves) {
    return chaves.reduce((total, chave) => {
        const c = porChave(chave);
        return total + (c ? TIPOS[c.tipo].pontos : 0);
    }, 0);
}

/** Nível a partir dos pontos — dá uma sensação de progressão contínua. */
function nivel(pontosTotais) {
    return Math.max(1, Math.floor(Math.sqrt(pontosTotais / 25)) + 1);
}

module.exports = {
    TIPOS,
    CONQUISTAS,
    PLATINA,
    todas,
    porChave,
    nomeTipo,
    localizar,
    localizarPorChave,
    contagemPorTipo,
    avaliar,
    pontos,
    nivel
};
