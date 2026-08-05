/**
 * Nível do jogador.
 *
 * ## O que ele recompensa
 *
 * Tempo de casa e variedade, não sorte. XP vem de rolar, batalhar, trocar,
 * descobrir carta nova, completar missão e coletar o diário — então quem
 * usa o bot inteiro sobe mais rápido que quem só rola.
 *
 * ## A recompensa que importa: CARGA DE ROLL
 *
 * E aqui está a descoberta que mudou o desenho desta fase.
 *
 * Carga de roll NÃO aumenta o teto diário. Com cooldown de 15 minutos, o
 * jogo gera 96 rolls por dia e ponto final — guardar os não usados não
 * cria nenhum a mais. O que a carga faz é impedir que eles sejam PERDIDOS
 * enquanto o jogador dorme ou trabalha.
 *
 *   teto de quem fica 24h no bot:     96/dia, com ou sem carga
 *   real de quem tem vida:         ~25/dia sem carga, ~40 com
 *
 * Ou seja: a carga **levanta o piso, não o teto**. Ela aproxima o jogador
 * casual do dedicado sem dar nada a mais a ninguém — que é exatamente o
 * oposto do que odds melhores por nível fariam.
 *
 * É por isso também que ela não conflita com o roll extra da loja: aquele
 * soma 3 ao teto (96 → 99), esta não soma nada. As duas resolvem a mesma
 * dor por caminhos que não se somam.
 *
 * ## Como a carga funciona sem campo novo
 *
 * O cooldown já é medido contra `lastRoll`. As cargas disponíveis são
 * quantos cooldowns couberam desde então, limitados pelo máximo do nível.
 * Ao rolar, `lastRoll` avança UM cooldown em vez de ir para agora — o
 * tempo que sobra fica guardado.
 *
 * Com `maxCargas = 1` (o padrão, abaixo do nível 10) a conta devolve
 * exatamente o comportamento de hoje. Ninguém que já joga percebe
 * diferença, e não há migração.
 */

// ---------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------

/**
 * Quanto cada ação rende.
 *
 * Rolar é a ação mais frequente, então vale pouco por vez. Descobrir carta
 * nova vale muito porque é o que empurra para o mercado e para a troca —
 * as partes do jogo que dependem de outras pessoas.
 */
const XP = {
    roll: 10,
    batalha: 25,
    vitoria: 25,
    descoberta: 50,
    troca: 30,
    missao: 40,
    diario: 60,
    caixa: 15
};

/**
 * XP total para chegar ao nível N.
 *
 * `50 * n * (n-1)` cresce de forma quadrática: cada nível custa um pouco
 * mais que o anterior, sem a parede exponencial que faz o jogador desistir
 * de olhar a barra.
 *
 * Para um jogador de ~360 XP/dia (25 rolls, 2 batalhas, o diário e uma
 * missão): nível 10 em ~12 dias, 20 em ~53, 30 em ~121.
 */
function xpDoNivel(n) {
    const nivel = Math.max(1, Math.floor(Number(n) || 1));
    return 50 * nivel * (nivel - 1);
}

/** O nível correspondente a um total de XP. */
function nivelDoXp(xpTotal) {
    const xp = Math.max(0, Number(xpTotal) || 0);
    // Inverso de 50n(n-1) = xp  ->  n = (1 + sqrt(1 + xp/12.5)) / 2
    return Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
}

/** Onde o jogador está dentro do nível atual. */
function progresso(xpTotal) {
    const xp = Math.max(0, Number(xpTotal) || 0);
    const nivel = nivelDoXp(xp);

    const inicio = xpDoNivel(nivel);
    const fim = xpDoNivel(nivel + 1);
    const faixa = fim - inicio;

    return {
        nivel,
        xp,
        noNivel: xp - inicio,
        paraOProximo: faixa,
        faltam: fim - xp,
        percentual: faixa > 0 ? ((xp - inicio) / faixa) * 100 : 0
    };
}

// ---------------------------------------------------------------------
// Cargas de roll
// ---------------------------------------------------------------------

/** Cargas de quem ainda não chegou ao nível 10 — o comportamento de hoje. */
const CARGAS_BASE = 1;

/** Em que níveis a capacidade sobe. */
const NIVEIS_DE_CARGA = [10, 20, 30];

/**
 * Quantas cargas o jogador acumula, pelo nível.
 *
 * Só cresce em degraus: subir de 11 para 12 não muda nada, e é isso que
 * faz o marco valer alguma coisa quando chega.
 */
function maxCargas(nivel) {
    const n = Math.max(1, Math.floor(Number(nivel) || 1));
    return CARGAS_BASE + NIVEIS_DE_CARGA.filter((marco) => n >= marco).length;
}

/**
 * Quantos rolls estão disponíveis agora.
 *
 * ⚠️ `lastRoll` ausente ou zero significa **nunca rolou**, e quem nunca
 * rolou começa com o teto cheio. Isso torna o zero um valor reservado:
 * nada pode gravar `lastRoll = 0` para dizer "pode rolar agora", porque
 * a leitura entende "pode rolar o teto inteiro".
 *
 * O roll extra da loja fazia exatamente isso, e no nível 30 entregaria
 * quatro rolls por uma compra. Hoje ele recua um cooldown, que é a forma
 * correta de liberar exatamente um.
 *
 * @param {number} lastRoll  timestamp do último roll (0/ausente = nunca rolou)
 * @param {number} cooldown  intervalo entre rolls, em ms
 * @param {number} maximo    teto de cargas do nível
 */
function cargasDisponiveis(lastRoll, cooldown, maximo, agora = Date.now()) {
    const teto = Math.max(1, Math.floor(Number(maximo) || 1));
    const ultimo = Number(lastRoll) || 0;
    if (ultimo <= 0) return teto;

    const decorrido = agora - ultimo;
    if (decorrido < 0) return 0;

    return Math.min(teto, Math.floor(decorrido / cooldown));
}

/**
 * O novo `lastRoll` depois de gastar uma carga.
 *
 * Avança UM cooldown em vez de ir para agora: o tempo que sobra continua
 * contando para a próxima carga. Sem isso, quem tem 3 cargas e usa 1
 * perderia as outras 2.
 */
function proximoLastRoll(cargasAntes, cooldown, agora = Date.now()) {
    const sobrando = Math.max(0, Math.floor(Number(cargasAntes) || 1) - 1);
    return agora - sobrando * cooldown;
}

/** Quando a próxima carga fica pronta. Null se já há carga disponível. */
function prontoEm(lastRoll, cooldown, maximo, agora = Date.now()) {
    if (cargasDisponiveis(lastRoll, cooldown, maximo, agora) > 0) return null;
    return Number(lastRoll) + cooldown;
}

// ---------------------------------------------------------------------
// Recompensas
// ---------------------------------------------------------------------

/**
 * O que cada nível entrega.
 *
 * Declarativo: nível novo é uma linha nova. O que não está listado dá a
 * recompensa padrão, para nenhum nível parecer vazio.
 *
 * `cargas: true` é só sinalização para a mensagem — o número real vem de
 * `maxCargas()`, que é a única fonte.
 */
const RECOMPENSAS = {
    2: { moedas: 2000 },
    3: { itens: { gema: 5 } },
    5: { moedas: 5000, caixas: { comum: 1 } },
    10: { moedas: 10000, cargas: true },
    15: { caixas: { tematica: 1 } },
    20: { moedas: 25000, cargas: true },
    25: { caixas: { elite: 1 } },
    30: { moedas: 50000, cargas: true },
    40: { caixas: { lendaria: 1 } },
    50: { moedas: 100000, caixas: { lendaria: 1 } }
};

/** Recompensa de quem subiu para um nível sem entrada própria. */
function recompensaPadrao(nivel) {
    return { moedas: 500 * nivel };
}

function recompensaDoNivel(nivel) {
    const n = Math.max(1, Math.floor(Number(nivel) || 1));
    return RECOMPENSAS[n] || recompensaPadrao(n);
}

/**
 * Todos os níveis cruzados entre dois totais de XP.
 *
 * Devolve uma lista porque uma ação só pode subir mais de um nível de uma
 * vez — resgatar várias missões juntas, por exemplo. Entregar só o último
 * faria o jogador perder as recompensas do caminho.
 */
function niveisCruzados(xpAntes, xpDepois) {
    const de = nivelDoXp(xpAntes);
    const ate = nivelDoXp(xpDepois);

    const niveis = [];
    for (let n = de + 1; n <= ate; n++) niveis.push(n);
    return niveis;
}

module.exports = {
    XP,
    CARGAS_BASE,
    NIVEIS_DE_CARGA,
    RECOMPENSAS,
    xpDoNivel,
    nivelDoXp,
    progresso,
    maxCargas,
    cargasDisponiveis,
    proximoLastRoll,
    prontoEm,
    recompensaDoNivel,
    recompensaPadrao,
    niveisCruzados
};
