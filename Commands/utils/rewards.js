const mongoose = require('mongoose');
const User = require('./userSchema');
const Card = require('./cardSchema');
const bolsa = require('./bag');
const itens = require('./items');
const caixas = require('./boxes');
const valores = require('./cardValues');
const { addBalance } = require('./economy');
const { registerDiscovery } = require('./discovery');
const { concederVip } = require('./vipService');
const { TIERS } = require('./vip');
const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * Catálogo de recompensas.
 *
 * ## Por que isto não é "o que um código de VIP entrega"
 *
 * O primeiro desenho era um código que dava VIP: `tier` e `meses` como
 * campos do próprio código. Funcionaria, e teria que ser jogado fora no
 * dia em que a loja passasse a vender uma caixa — porque aí o código
 * precisaria de `caixa` e `quantidade`, e nada disso cabe nos mesmos dois
 * campos.
 *
 * Aqui a recompensa é **uma lista de coisas**, e cada tipo de coisa mora
 * numa entrada deste catálogo, no mesmo espírito do `items.js` e do
 * `achievements.js`. Um código pode dar VIP, ou uma caixa, ou moedas, ou
 * os três de uma vez — e vender algo novo é adicionar UMA entrada aqui,
 * sem tocar no resgate, no comando ou no schema.
 *
 * ## O contrato de um tipo
 *
 * | Função | Quando roda | Para quê |
 * |---|---|---|
 * | `validar(params)` | ao CRIAR o código | recusar configuração errada |
 * | `entregar(userId, params)` | ao RESGATAR | aplicar de verdade |
 * | `descrever(params, locale)` | nas duas telas | texto para humano |
 *
 * **`validar` é o que impede o pior caso deste sistema.** Sem ele, um
 * código com `{ tipo: 'caixa', chave: 'lendária' }` (com acento) é aceito,
 * vendido, pago — e só falha na cara do jogador, na hora do resgate, com o
 * dinheiro já no seu bolso. Validar na criação transforma isso num erro na
 * sua tela, antes de existir cliente.
 *
 * ## O que NÃO entra aqui
 *
 * Nada que dê vantagem de combate, pela mesma razão de sempre — e agora
 * com um agravante: código é comprado com dinheiro real. Atributo, chance
 * de raridade ou resultado de batalha vendidos por código seriam
 * exatamente o que `vip.js` passa o arquivo inteiro evitando.
 *
 * Carta é o limite, e é aceitável porque a carta entregue é idêntica à que
 * o `/roll` daria: ela não é melhor por ter vindo de um código.
 */

/** Erro de configuração de recompensa — o painel mostra a mensagem crua. */
class ErroDeRecompensa extends Error {}

// ---------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------

function inteiroPositivo(valor, campo, maximo) {
    const n = Math.floor(Number(valor));
    if (!Number.isFinite(n) || n <= 0) {
        throw new ErroDeRecompensa(`"${campo}" precisa ser um número maior que zero.`);
    }
    if (maximo && n > maximo) {
        throw new ErroDeRecompensa(`"${campo}" passa do máximo permitido (${maximo}).`);
    }
    return n;
}

/**
 * Tetos por recompensa.
 *
 * Não são regra de jogo: são guarda contra o dedo escorregar num zero a
 * mais no painel. Um código de 500.000 moedas criado por engano não tem
 * como ser desfeito depois de resgatado — a moeda já entrou na economia.
 */
const MAXIMO = {
    moedas: 1_000_000,
    quantidade: 100,
    meses: 120
};

/**
 * A cópia da carta para o inventário.
 *
 * ⚠️ Esta lógica existe em mais quatro lugares (`rollCollect`, `marketEnd`,
 * `boxRun`, `scripts/grantCards`). Todas concordam hoje porque todas leem
 * `valores.valoresDaCarta`, mas isso é disciplina, não garantia — a
 * primeira versão do `grantCards` usava `overall * 10` e sujava o acervo
 * em silêncio. Vale consolidar num util só.
 */
function copiaParaInventario(card) {
    const { marketValue, valueToSell } = valores.valoresDaCarta(card);
    return {
        cardId: new mongoose.Types.ObjectId(),
        originalCardId: card._id,
        name: card.name,
        series: card.series,
        seriesImage: card.seriesImage,
        baseImage: card.baseImage,
        characterImage: card.characterImage,
        rarity: card.rarity,
        overall: card.overall,
        ATA: card.ATA,
        LIF: card.LIF,
        POW: card.POW,
        obtainedAt: new Date(),
        marketValue,
        valueToSell,
        // Congela a negociabilidade na entrega, igual ao rollCollect.
        comercializavel: card.comercializavel !== false
    };
}

// ---------------------------------------------------------------------
// Os tipos
// ---------------------------------------------------------------------

const TIPOS = {
    /**
     * Assinatura.
     *
     * Passa por `concederVip`, o mesmo caminho do webhook de pagamento e
     * do painel — então herda a idempotência, o acúmulo de dias na
     * renovação e o registro na coleção `payments`. Um código de VIP
     * aparece no histórico de pagamento do jogador como qualquer compra.
     */
    vip: {
        chave: 'vip',
        emoji: '👑',
        validar(params) {
            const tier = String(params?.tier || '').toLowerCase().trim();
            if (!TIERS[tier]) {
                throw new ErroDeRecompensa(
                    `Plano "${params?.tier}" não existe. Use: ${Object.keys(TIERS).join(', ')}.`
                );
            }
            return { tier, meses: inteiroPositivo(params.meses ?? 1, 'meses', MAXIMO.meses) };
        },
        async entregar(userId, params, contexto) {
            const resultado = await concederVip({
                discordUserId: userId,
                tier: params.tier,
                meses: params.meses,
                // O código É o identificador do pagamento. Dois resgates do
                // mesmo código (que a trava de cima já impede) tropeçariam
                // aqui também, na idempotência que o webhook já tinha.
                providerPaymentId: `codigo:${contexto.codigo}`,
                provider: 'codigo',
                valorBRL: TIERS[params.tier].precoBRL * params.meses,
                payloadBruto: { codigo: contexto.codigo, origem: contexto.origem }
            });
            return { expiraEm: resultado.user?.vip?.expiresAt || null };
        },
        descrever(params, locale) {
            return traduzir(locale, 'resgate.recompensa_vip', {
                emoji: TIERS[params.tier].emoji,
                plano: traduzir(locale, `vip_catalogo.tiers.${params.tier}`),
                meses: params.meses
            });
        }
    },

    /** Moeda do jogo. Cai direto no saldo, de forma atômica. */
    moedas: {
        chave: 'moedas',
        emoji: '🪙',
        validar(params) {
            return { quantidade: inteiroPositivo(params?.quantidade, 'quantidade', MAXIMO.moedas) };
        },
        async entregar(userId, params) {
            const user = await addBalance(userId, params.quantidade);
            return { saldoDepois: user?.balance ?? null };
        },
        descrever(params, locale) {
            return traduzir(locale, 'resgate.recompensa_moedas', { quantidade: params.quantidade });
        }
    },

    /**
     * Item da bolsa (gema, pergaminho, roll extra).
     *
     * A chave é validada contra o catálogo porque ela vira caminho de
     * campo no Mongo — ver o cabeçalho de `bag.js`. Chave inventada num
     * código escreveria em outro lugar do documento do jogador.
     */
    item: {
        chave: 'item',
        emoji: '🎒',
        validar(params) {
            const chave = String(params?.chave || '').toLowerCase().trim();
            if (!itens.existe(chave)) {
                throw new ErroDeRecompensa(
                    `Item "${params?.chave}" não existe. Use: ${Object.keys(itens.ITENS).join(', ')}.`
                );
            }
            return { chave, quantidade: inteiroPositivo(params.quantidade ?? 1, 'quantidade', MAXIMO.quantidade) };
        },
        async entregar(userId, params) {
            const total = await bolsa.adicionar(userId, params.chave, params.quantidade);
            return { naBolsa: total };
        },
        descrever(params, locale) {
            const item = itens.localizarPorChave(params.chave, locale);
            return traduzir(locale, 'resgate.recompensa_item', {
                emoji: item.emoji,
                nome: item.nome,
                quantidade: params.quantidade
            });
        }
    },

    /**
     * Caixa, guardada fechada na bolsa.
     *
     * Ela entra pela chave prefixada (`caixa_lendaria`), a mesma que a
     * `/loja` usa — então uma caixa vendida por código é indistinguível de
     * uma comprada com moeda, e o `/caixa abrir` não precisa saber de nada.
     *
     * Caixa sem preço (a do Apoiador) também pode ser dada por aqui: a
     * validação olha o catálogo, não a vitrine.
     */
    caixa: {
        chave: 'caixa',
        emoji: '📦',
        validar(params) {
            const chave = String(params?.chave || '').toLowerCase().trim();
            if (!caixas.existe(chave)) {
                throw new ErroDeRecompensa(
                    `Caixa "${params?.chave}" não existe. Use: ${Object.keys(caixas.CAIXAS).join(', ')}.`
                );
            }
            return { chave, quantidade: inteiroPositivo(params.quantidade ?? 1, 'quantidade', MAXIMO.quantidade) };
        },
        async entregar(userId, params) {
            const total = await bolsa.adicionar(
                userId, caixas.chaveNaBolsa(params.chave), params.quantidade
            );
            return { naBolsa: total };
        },
        descrever(params, locale) {
            const caixa = caixas.localizarPorChave(params.chave, locale);
            return traduzir(locale, 'resgate.recompensa_caixa', {
                emoji: caixa.emoji,
                nome: caixa.nome,
                quantidade: params.quantidade
            });
        }
    },

    /**
     * Uma carta específica do catálogo.
     *
     * É por aqui que a carta de evento e a carta da beta são entregues. A
     * cópia é idêntica à do `/roll` — mesmos atributos, mesmo valor — e a
     * descoberta entra na Pokédex normalmente.
     *
     * `cardId` e não nome: nome muda, e dois personagens podem ter nomes
     * parecidos. O painel resolve o nome para o id antes de criar o código.
     */
    carta: {
        chave: 'carta',
        emoji: '🎴',
        validar(params) {
            const id = String(params?.cardId || '').trim();
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new ErroDeRecompensa(`"${params?.cardId}" não é um id de carta válido.`);
            }
            return {
                cardId: id,
                quantidade: inteiroPositivo(params.quantidade ?? 1, 'quantidade', MAXIMO.quantidade),
                semPokedex: params.semPokedex === true
            };
        },
        async entregar(userId, params) {
            const card = await Card.findById(params.cardId).lean();
            // Carta apagada do catálogo depois do código criado. Falha alto:
            // entregar nada em silêncio deixaria o jogador achando que
            // resgatou, e o código já teria sido consumido.
            if (!card) {
                throw new ErroDeRecompensa(`A carta ${params.cardId} não está mais no catálogo.`);
            }

            const copias = Array.from({ length: params.quantidade }, () => copiaParaInventario(card));
            await User.findOneAndUpdate(
                { id: userId },
                { $push: { inventory: { $each: copias } } },
                { upsert: true, setDefaultsOnInsert: true }
            );

            let inedita = false;
            if (!params.semPokedex) {
                inedita = await registerDiscovery(userId, card._id);
            }
            return { nome: card.name, raridade: card.rarity, inedita };
        },
        descrever(params, locale) {
            return traduzir(locale, 'resgate.recompensa_carta', { quantidade: params.quantidade });
        }
    }
};

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------

function getTipo(tipo) {
    return TIPOS[String(tipo || '').toLowerCase().trim()] || null;
}

function existe(tipo) {
    return getTipo(tipo) !== null;
}

/**
 * Normaliza e valida UMA recompensa.
 *
 * Devolve a recompensa com os params já limpos — é essa versão que fica
 * gravada, não a que veio da tela. Assim `{ meses: "3" }` vira
 * `{ meses: 3 }` no banco, e a entrega nunca precisa desconfiar do que
 * está lendo.
 */
function validar(recompensa) {
    const tipo = getTipo(recompensa?.tipo);
    if (!tipo) {
        throw new ErroDeRecompensa(
            `Tipo de recompensa "${recompensa?.tipo}" não existe. Use: ${Object.keys(TIPOS).join(', ')}.`
        );
    }
    return { tipo: tipo.chave, params: tipo.validar(recompensa.params || {}) };
}

/** Valida uma lista inteira. Uma recompensa ruim reprova o código todo. */
function validarLista(recompensas) {
    if (!Array.isArray(recompensas) || recompensas.length === 0) {
        throw new ErroDeRecompensa('O código precisa entregar pelo menos uma recompensa.');
    }
    if (recompensas.length > 10) {
        throw new ErroDeRecompensa('Um código entrega no máximo 10 recompensas.');
    }
    return recompensas.map(validar);
}

/** Aplica uma recompensa já validada. */
function entregar(userId, recompensa, contexto = {}) {
    const tipo = getTipo(recompensa.tipo);
    if (!tipo) throw new ErroDeRecompensa(`Tipo "${recompensa.tipo}" desapareceu do catálogo.`);
    return tipo.entregar(userId, recompensa.params, contexto);
}

/** Texto de uma recompensa, para a tela do jogador e a do painel. */
function descrever(recompensa, locale = DEFAULT_LOCALE) {
    const tipo = getTipo(recompensa?.tipo);
    if (!tipo) return String(recompensa?.tipo || '?');
    return tipo.descrever(recompensa.params || {}, locale);
}

module.exports = {
    TIPOS,
    MAXIMO,
    ErroDeRecompensa,
    getTipo,
    existe,
    validar,
    validarLista,
    entregar,
    descrever,
    copiaParaInventario
};
