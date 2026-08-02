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
 */

const TIPOS = {
    bronze: { emoji: '🥉', nome: 'Bronze', cor: 0xCD7F32, peso: 1, pontos: 15 },
    prata: { emoji: '🥈', nome: 'Prata', cor: 0xC0C0C0, peso: 2, pontos: 30 },
    ouro: { emoji: '🥇', nome: 'Ouro', cor: 0xFFD700, peso: 3, pontos: 90 },
    platina: { emoji: '💎', nome: 'Platina', cor: 0x5DADE2, peso: 4, pontos: 300 }
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
        nome: 'Primeira de muitas',
        descricao: 'Guarde sua primeira carta no inventário.',
        tipo: 'bronze',
        condicao: (c) => c.totalCartas >= 1
    },
    {
        chave: 'primeira_vitoria',
        nome: 'Estreia vitoriosa',
        descricao: 'Vença sua primeira batalha.',
        tipo: 'bronze',
        condicao: (c) => c.stats.batalhasVencidas >= 1
    },
    {
        chave: 'primeira_venda',
        nome: 'Comerciante',
        descricao: 'Venda uma carta no mercado.',
        tipo: 'bronze',
        condicao: (c) => c.stats.vendasMercado >= 1
    },
    {
        chave: 'primeira_troca',
        nome: 'Negociador',
        descricao: 'Complete uma troca com outro jogador.',
        tipo: 'bronze',
        condicao: (c) => c.stats.trocasFeitas >= 1
    },
    {
        chave: 'colecionador_10',
        nome: 'Começando a coleção',
        descricao: 'Descubra 10 cartas na Pokédex.',
        tipo: 'bronze',
        condicao: (c) => c.descobertas >= 10,
        progresso: (c) => ({ atual: c.descobertas, alvo: 10 })
    },
    {
        chave: 'rico_1000',
        nome: 'Primeiro milheiro',
        descricao: 'Acumule 1.000 moedas.',
        tipo: 'bronze',
        condicao: (c) => c.balance >= 1000,
        progresso: (c) => ({ atual: c.balance, alvo: 1000 })
    },
    {
        chave: 'streak_3',
        nome: 'Criando o hábito',
        descricao: 'Colete a recompensa diária 3 dias seguidos.',
        tipo: 'bronze',
        condicao: (c) => c.streakMaior >= 3,
        progresso: (c) => ({ atual: c.streakMaior, alvo: 3 })
    },
    {
        chave: 'primeira_rara',
        nome: 'Achado raro',
        descricao: 'Tenha uma carta rara ou melhor.',
        tipo: 'bronze',
        condicao: (c) => c.porRaridade.rare + c.porRaridade['ultra rare'] + c.porRaridade.legendary + c.porRaridade.master >= 1
    },
    {
        chave: 'favorita',
        nome: 'Tenho minha preferida',
        descricao: 'Defina uma carta favorita.',
        tipo: 'bronze',
        condicao: (c) => Boolean(c.favCard)
    },

    // ---------- Dedicação (prata) ----------
    {
        chave: 'colecionador_100',
        nome: 'Colecionador',
        descricao: 'Descubra 100 cartas na Pokédex.',
        tipo: 'prata',
        condicao: (c) => c.descobertas >= 100,
        progresso: (c) => ({ atual: c.descobertas, alvo: 100 })
    },
    {
        chave: 'vitorias_25',
        nome: 'Veterano de guerra',
        descricao: 'Vença 25 batalhas.',
        tipo: 'prata',
        condicao: (c) => c.stats.batalhasVencidas >= 25,
        progresso: (c) => ({ atual: c.stats.batalhasVencidas, alvo: 25 })
    },
    {
        chave: 'rico_100k',
        nome: 'Magnata',
        descricao: 'Acumule 100.000 moedas.',
        tipo: 'prata',
        condicao: (c) => c.balance >= 100000,
        progresso: (c) => ({ atual: c.balance, alvo: 100000 })
    },
    {
        chave: 'streak_7',
        nome: 'Uma semana inteira',
        descricao: 'Mantenha 7 dias de sequência no diário.',
        tipo: 'prata',
        condicao: (c) => c.streakMaior >= 7,
        progresso: (c) => ({ atual: c.streakMaior, alvo: 7 })
    },
    {
        chave: 'lendaria',
        nome: 'Lenda viva',
        descricao: 'Tenha uma carta lendária.',
        tipo: 'prata',
        condicao: (c) => c.porRaridade.legendary + c.porRaridade.master >= 1
    },
    {
        chave: 'trocas_10',
        nome: 'Corretor de cartas',
        descricao: 'Complete 10 trocas.',
        tipo: 'prata',
        condicao: (c) => c.stats.trocasFeitas >= 10,
        progresso: (c) => ({ atual: c.stats.trocasFeitas, alvo: 10 })
    },
    {
        chave: 'serie_completa',
        nome: 'Fã de carteirinha',
        descricao: 'Complete todas as cartas de uma série na Pokédex.',
        tipo: 'prata',
        condicao: (c) => c.seriesCompletas >= 1,
        progresso: (c) => ({ atual: c.seriesCompletas, alvo: 1 })
    },
    {
        chave: 'criticos_50',
        nome: 'Golpe certeiro',
        descricao: 'Acerte 50 golpes críticos em batalha.',
        tipo: 'prata',
        condicao: (c) => c.stats.criticos >= 50,
        progresso: (c) => ({ atual: c.stats.criticos, alvo: 50 })
    },
    {
        chave: 'virada',
        nome: 'Nunca desista',
        descricao: 'Vença um confronto com um golpe de virada (abaixo de 40% de vida).',
        tipo: 'prata',
        condicao: (c) => c.stats.viradas >= 1
    },
    {
        chave: 'elo_1300',
        nome: 'Competidor',
        descricao: 'Alcance 1300 de pontuação no ranking.',
        tipo: 'prata',
        condicao: (c) => c.picoElo >= 1300,
        progresso: (c) => ({ atual: c.picoElo, alvo: 1300 })
    },

    // ---------- Elite (ouro) ----------
    {
        chave: 'colecionador_500',
        nome: 'Arquivista',
        descricao: 'Descubra 500 cartas na Pokédex.',
        tipo: 'ouro',
        condicao: (c) => c.descobertas >= 500,
        progresso: (c) => ({ atual: c.descobertas, alvo: 500 })
    },
    {
        chave: 'pokedex_completa',
        nome: 'Catálogo completo',
        descricao: 'Descubra TODAS as cartas do jogo.',
        tipo: 'ouro',
        condicao: (c) => c.totalCatalogo > 0 && c.descobertas >= c.totalCatalogo,
        progresso: (c) => ({ atual: c.descobertas, alvo: c.totalCatalogo })
    },
    {
        chave: 'mestra',
        nome: 'Tocado pelos deuses',
        descricao: 'Tenha uma carta mestra.',
        tipo: 'ouro',
        condicao: (c) => c.porRaridade.master >= 1
    },
    {
        chave: 'vitorias_100',
        nome: 'Invencível',
        descricao: 'Vença 100 batalhas.',
        tipo: 'ouro',
        condicao: (c) => c.stats.batalhasVencidas >= 100,
        progresso: (c) => ({ atual: c.stats.batalhasVencidas, alvo: 100 })
    },
    {
        chave: 'streak_30',
        nome: 'Todo santo dia',
        descricao: 'Mantenha 30 dias de sequência no diário.',
        tipo: 'ouro',
        condicao: (c) => c.streakMaior >= 30,
        progresso: (c) => ({ atual: c.streakMaior, alvo: 30 })
    },
    {
        chave: 'elo_1600',
        nome: 'Lenda da arena',
        descricao: 'Alcance 1600 de pontuação no ranking.',
        tipo: 'ouro',
        condicao: (c) => c.picoElo >= 1600,
        progresso: (c) => ({ atual: c.picoElo, alvo: 1600 })
    },
    {
        chave: 'torneio',
        nome: 'Campeão',
        descricao: 'Vença um torneio.',
        tipo: 'ouro',
        condicao: (c) => c.stats.torneiosVencidos >= 1
    },
    {
        chave: 'deck_lendario',
        nome: 'Time dos sonhos',
        descricao: 'Tenha 3 cartas lendárias ou mestras ao mesmo tempo.',
        tipo: 'ouro',
        condicao: (c) => c.porRaridade.legendary + c.porRaridade.master >= 3,
        progresso: (c) => ({ atual: c.porRaridade.legendary + c.porRaridade.master, alvo: 3 })
    }
];

const PLATINA = {
    chave: 'platina',
    nome: 'AniBattle Platinado',
    descricao: 'Conquiste todos os outros troféus.',
    tipo: 'platina'
};

/** Todos os troféus, incluindo a platina. */
function todas() {
    return [...CONQUISTAS, PLATINA];
}

function porChave(chave) {
    return todas().find((c) => c.chave === chave) || null;
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
    contagemPorTipo,
    avaliar,
    pontos,
    nivel
};
