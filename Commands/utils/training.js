const Card = require('./cardSchema');
const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * Modo treino: a mesma batalha do `/battle`, contra um BOT.
 *
 * ## A regra inegociável deste arquivo
 *
 * Treino NÃO VALE NADA. Não dá moeda, não move ELO, não conta para missão,
 * conquista ou estatística, e não consome nem entrega carta nenhuma.
 *
 * Por isso este módulo, o `treinoRun.js` e o `treinoButtonHandler.js` não
 * podem importar `economy`, `elo`, `progresso` nem `battleState`. Existe
 * uma verificação em `tests/convencoes.test.js` que falha se alguém
 * plugar contadores aqui — sem ela, é o tipo de coisa que entra sem
 * ninguém perceber e transforma o modo de teste numa fábrica de moeda.
 *
 * A única leitura no banco é o catálogo de cartas, para sortear o time do
 * rival. O inventário do jogador chega pronto, de quem chamou.
 *
 * ## Por que a sessão fica em memória, e não no Mongo
 *
 * O `/battle` guarda a batalha no banco porque tem aposta em jogo: se o
 * bot cair no meio da escolha do time, o dinheiro precisa voltar, e para
 * isso alguém tem que saber que aquela batalha existiu. O treino não tem
 * nada a devolver. Uma queda no meio significa, no máximo, que o jogador
 * chama `/treino` de novo.
 *
 * Guardar em memória é o desenho certo justamente porque deixa impossível
 * o treino sujar o banco — e é o que permite a trava de import acima ser
 * verdade.
 */

/**
 * Nome próprio do rival — não se traduz.
 *
 * É o nome de um personagem, como o nome de uma carta. Traduzir faria o
 * jogador em inglês e o jogador em português falarem de dois adversários
 * diferentes ao comparar resultados.
 */
const NOME_RIVAL = 'BOT Caviar';

/**
 * Dificuldades.
 *
 * O multiplicador se aplica sobre a média de overall do SEU time, então o
 * treino acompanha a sua coleção: quem tem cartas fracas enfrenta cartas
 * fracas, e continua sendo um teste útil.
 *
 * Só a mecânica mora aqui; o nome sai de `treino_catalogo.dificuldades`
 * por `localizarDificuldade()`.
 */
const DIFICULDADES = {
    facil: { chave: 'facil', emoji: '🟢', multiplicador: 0.80 },
    parelho: { chave: 'parelho', emoji: '🟡', multiplicador: 1.00 },
    dificil: { chave: 'dificil', emoji: '🔴', multiplicador: 1.20 }
};

/** A dificuldade com o nome no idioma pedido. */
function localizarDificuldade(dificuldade, locale = DEFAULT_LOCALE) {
    const base = typeof dificuldade === 'string'
        ? (DIFICULDADES[dificuldade] || DIFICULDADES[PADRAO])
        : (dificuldade || DIFICULDADES[PADRAO]);
    return {
        ...base,
        nome: traduzir(locale, `treino_catalogo.dificuldades.${base.chave}`)
    };
}

const PADRAO = 'parelho';

/** Largura da faixa em volta do alvo, para o rival não sair sempre igual. */
const TOLERANCIA = 0.15;

/** Média de overall de um time. */
function mediaOverall(cartas) {
    if (!cartas || cartas.length === 0) return 0;
    const soma = cartas.reduce((acumulado, c) => acumulado + (c.overall || 0), 0);
    return soma / cartas.length;
}

/**
 * Faixa de overall que o rival deve ter.
 *
 * Devolve `{ min, max, alvo }`. O mínimo nunca desce de 1 nem sobe acima
 * do máximo — sem isso, um time muito fraco no modo fácil geraria uma
 * faixa invertida e a consulta não acharia carta nenhuma.
 */
function faixaDeOverall(mediaDoTime, dificuldade = PADRAO) {
    const config = DIFICULDADES[dificuldade] || DIFICULDADES[PADRAO];
    const alvo = Math.max(1, Math.round(mediaDoTime * config.multiplicador));

    const min = Math.max(1, Math.round(alvo * (1 - TOLERANCIA)));
    const max = Math.max(min + 1, Math.round(alvo * (1 + TOLERANCIA)));

    return { min, max, alvo };
}

/**
 * As três melhores cartas do inventário.
 *
 * O jogador escolhe o time dele na mão, carta por carta — isto aqui NÃO é
 * o time dele. Serve só para medir a força da coleção e calibrar a
 * dificuldade do rival, que é sorteado antes da escolha começar.
 */
function melhoresTres(inventario) {
    return [...(inventario || [])]
        .sort((a, b) => (b.overall || 0) - (a.overall || 0))
        .slice(0, 3);
}

/**
 * Sorteia o time do BOT Caviar.
 *
 * O rival sai ANTES de o jogador montar o time, e é mostrado na tela de
 * escolha. No `/battle` você não vê o time do oponente, mas ali o
 * objetivo é o duelo; aqui é treinar — ver contra o que você está
 * escalando é o que transforma a escolha num exercício de verdade, já que
 * a ordem das cartas decide os confrontos.
 *
 * Tenta primeiro dentro da faixa; se o catálogo não tiver cartas ali,
 * abre a busca. Um catálogo pequeno não pode impedir o treino de
 * funcionar — é justamente quem está começando que mais usa o modo.
 */
async function montarTimeRival(inventarioDoJogador, dificuldade = PADRAO) {
    const referencia = melhoresTres(inventarioDoJogador);
    const faixa = faixaDeOverall(mediaOverall(referencia), dificuldade);

    let cartas = await Card.aggregate([
        { $match: { overall: { $gte: faixa.min, $lte: faixa.max } } },
        { $sample: { size: 3 } }
    ]);

    // Faixa vazia: sorteia de qualquer lugar do catálogo.
    if (cartas.length < 3) {
        cartas = await Card.aggregate([{ $sample: { size: 3 } }]);
    }

    if (cartas.length === 0) return { ok: false, motivo: 'CATALOGO_VAZIO' };

    // Catálogo com menos de 3 cartas: repete para fechar o time.
    const time = Array.from({ length: 3 }, (_, i) => cartas[i % cartas.length]);

    return {
        ok: true,
        referencia,
        timeRival: time.map((c) => ({
            name: c.name,
            series: c.series,
            rarity: c.rarity,
            overall: c.overall,
            ATA: c.ATA,
            LIF: c.LIF,
            POW: c.POW
        })),
        faixa,
        dificuldade: DIFICULDADES[dificuldade] || DIFICULDADES[PADRAO]
    };
}

// ---------------------------------------------------------------------
// Sessões de treino em andamento
// ---------------------------------------------------------------------

/**
 * Quanto tempo uma escolha de time fica de pé.
 *
 * Generoso de propósito: escolher 3 cartas entre 20 leva tempo, e
 * expirar no meio só irritaria. Como nada está em jogo, não há pressa
 * nenhuma para limpar.
 */
const DURACAO_SESSAO_MS = 10 * 60 * 1000;

/** @type {Map<string, object>} sessaoId -> sessão */
const sessoes = new Map();

/**
 * Ids curtos e sem `_`.
 *
 * O separador dos customId de botão é `_`, então um id com underscore
 * quebraria a leitura do `treino_pick_<sessao>_<carta>`. Base 36 só
 * produz letras e números.
 */
function gerarId() {
    return `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36).padStart(3, '0')}`;
}

/** Remove sessões vencidas. Roda junto de cada criação — não precisa de timer. */
function limparExpiradas(agora = Date.now()) {
    for (const [id, sessao] of sessoes) {
        if (agora - sessao.criadaEm > DURACAO_SESSAO_MS) sessoes.delete(id);
    }
    return sessoes.size;
}

/**
 * Abre uma sessão de escolha de time.
 *
 * @param {object} dados
 * @param {string} dados.userId
 * @param {string} dados.username
 * @param {Array}  dados.inventario  inventário no momento do comando
 * @param {Array}  dados.timeRival   time do BOT, já sorteado
 * @param {object} dados.dificuldade
 * @param {string} dados.canalId     onde a luta será transmitida
 * @param {string} dados.locale      idioma do jogador no momento da abertura
 *
 * O locale fica gravado na sessão porque a luta é resolvida depois, num
 * clique de botão que não passa mais pelo comando — e `resolverTreino`
 * recebe só a sessão. Guardar aqui evita uma ida ao banco na hora de
 * narrar, e mantém o treino inteiro num idioma só do começo ao fim.
 */
function criarSessao({ userId, username, inventario, timeRival, dificuldade, canalId, locale = DEFAULT_LOCALE }) {
    limparExpiradas();

    const id = gerarId();
    const sessao = {
        id,
        userId,
        username,
        inventario,
        timeRival,
        dificuldade,
        canalId,
        locale,
        deck: [],
        selectedIds: [],
        // Trava contra clique duplo na terceira carta: sem isso, dois
        // cliques que chegam juntos resolveriam a luta duas vezes e o
        // canal receberia duas transmissões.
        resolvendo: false,
        mensagemId: null,
        mensagemCanalId: null,
        criadaEm: Date.now()
    };

    sessoes.set(id, sessao);
    return sessao;
}

/** Sessão viva pelo id, ou null se não existe ou já venceu. */
function getSessao(id) {
    const sessao = sessoes.get(id);
    if (!sessao) return null;
    if (Date.now() - sessao.criadaEm > DURACAO_SESSAO_MS) {
        sessoes.delete(id);
        return null;
    }
    return sessao;
}

/** A sessão aberta de um jogador, se houver. Um treino por vez. */
function getSessaoDoUsuario(userId) {
    limparExpiradas();
    for (const sessao of sessoes.values()) {
        if (sessao.userId === userId) return sessao;
    }
    return null;
}

/** Guarda onde a tela de escolha foi parar, para conseguir editá-la depois. */
function registrarMensagem(id, mensagemId, canalId) {
    const sessao = getSessao(id);
    if (!sessao) return null;
    sessao.mensagemId = mensagemId;
    sessao.mensagemCanalId = canalId;
    return sessao;
}

/**
 * Acrescenta uma carta ao time.
 *
 * @returns {{ ok: boolean, motivo?: string, sessao?: object, completo?: boolean }}
 */
function escolherCarta(id, carta) {
    const sessao = getSessao(id);
    if (!sessao) return { ok: false, motivo: 'SESSAO_EXPIRADA' };
    if (sessao.deck.length >= 3) return { ok: false, motivo: 'TIME_CHEIO' };

    const cartaId = String(carta._id);
    if (sessao.selectedIds.includes(cartaId)) return { ok: false, motivo: 'JA_ESCOLHIDA' };

    sessao.deck.push(carta);
    sessao.selectedIds.push(cartaId);

    return { ok: true, sessao, completo: sessao.deck.length === 3 };
}

/**
 * Reserva a sessão para resolver a luta.
 *
 * Devolve a sessão só para o PRIMEIRO que chamar — o mesmo papel do
 * `claimForResolution` do `/battle`, só que sem banco.
 */
function reservarParaResolver(id) {
    const sessao = getSessao(id);
    if (!sessao || sessao.resolvendo || sessao.deck.length < 3) return null;
    sessao.resolvendo = true;
    return sessao;
}

function encerrarSessao(id) {
    const sessao = sessoes.get(id) || null;
    sessoes.delete(id);
    return sessao;
}

module.exports = {
    NOME_RIVAL,
    DIFICULDADES,
    localizarDificuldade,
    PADRAO,
    TOLERANCIA,
    DURACAO_SESSAO_MS,
    mediaOverall,
    faixaDeOverall,
    melhoresTres,
    montarTimeRival,
    criarSessao,
    getSessao,
    getSessaoDoUsuario,
    registrarMensagem,
    escolherCarta,
    reservarParaResolver,
    encerrarSessao,
    limparExpiradas
};
