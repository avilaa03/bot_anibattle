/**
 * A bolsa do jogador: quantos de cada item ele tem.
 *
 * ## Por que é um Map e não um array
 *
 * O plano desenhava `bolsa: [{ item, quantidade }]`. Virou `Map` pelo
 * mesmo motivo que `telemetria.porHora` virou: com array, somar 1 a um
 * item exige descobrir antes se ele já está lá — e esse "descobrir antes"
 * é uma corrida.
 *
 * Dois `/loja comprar` disparados junto veriam os dois que o item não
 * existe, e os dois dariam `$push`: o jogador fica com duas entradas de
 * `gema` na bolsa, e toda leitura passa a mostrar só a primeira. O item
 * comprado some sem erro nenhum no log.
 *
 * Com Map, `$inc: { 'bolsa.gema': 5 }` cria o campo se não existir e soma
 * se existir, numa escrita só. Não há caminho para duplicata.
 *
 * ## A chave vira caminho de campo no Mongo
 *
 * `bolsa.<chave>` é montado por interpolação, então uma chave com `.` ou
 * `$` escreveria em outro lugar do documento. Por isso TUDO aqui passa
 * por `itens.existe()` antes de tocar no banco: o catálogo é a lista de
 * permissão, e chave que não está nele nunca vira caminho.
 */

const User = require('./userSchema');
const itens = require('./itens');
const caixas = require('./caixas');

/** Erro de regra de negócio, para o comando distinguir de falha técnica. */
class ErroDeBolsa extends Error {}

/**
 * A bolsa guarda DUAS coisas: itens (`gema`) e caixas (`caixa_lendaria`).
 *
 * O merge acontece aqui, e não no `itens.js`, porque é a bolsa que
 * carrega os dois — o catálogo de itens continua sendo só o que a `/loja`
 * vende, e o de caixas continua sendo só o que o `/caixa` abre.
 *
 * Isto é a LISTA DE PERMISSÃO das chaves. Ver o cabeçalho: a chave vira
 * caminho de campo no Mongo, então chave fora daqui nunca pode ser escrita.
 */
function chaveConhecida(chave) {
    return itens.existe(chave) || caixas.existeNaBolsa(chave);
}

function campo(chave) {
    if (!chaveConhecida(chave)) {
        throw new ErroDeBolsa(`Item desconhecido: "${chave}".`);
    }
    return `bolsa.${chave}`;
}

/**
 * Soma itens à bolsa. Cria o jogador se ainda não existir.
 *
 * @returns {Promise<number>} a quantidade depois da soma
 */
async function adicionar(userId, chave, quantidade = 1) {
    const n = Math.floor(Number(quantidade) || 0);
    if (n <= 0) throw new ErroDeBolsa('A quantidade precisa ser maior que zero.');

    const doc = await User.findOneAndUpdate(
        { id: userId },
        { $inc: { [campo(chave)]: n } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return quantidadeDe(doc, chave);
}

/**
 * Consome itens da bolsa, só se houver o suficiente.
 *
 * O `$gte` no FILTRO é o ponto todo: quem decide se dá é o banco, no
 * mesmo instante da escrita. Ler a quantidade antes e conferir no Node
 * deixaria uma janela entre a leitura e a gravação — dois `/aprimorar`
 * clicados junto gastariam a mesma gema duas vezes.
 *
 * @returns {Promise<object|null>} o usuário atualizado, ou null se faltou item
 */
async function consumir(userId, chave, quantidade = 1) {
    const n = Math.floor(Number(quantidade) || 0);
    if (n <= 0) throw new ErroDeBolsa('A quantidade precisa ser maior que zero.');

    return User.findOneAndUpdate(
        { id: userId, [campo(chave)]: { $gte: n } },
        { $inc: { [campo(chave)]: -n } },
        { new: true }
    );
}

/** Quantos deste item o jogador tem. Aceita documento Mongoose ou `.lean()`. */
function quantidadeDe(user, chave) {
    const bolsa = user?.bolsa;
    if (!bolsa) return 0;
    // `.lean()` devolve objeto puro; o documento Mongoose devolve Map.
    const valor = typeof bolsa.get === 'function' ? bolsa.get(chave) : bolsa[chave];
    return Math.max(0, Number(valor) || 0);
}

/**
 * A bolsa inteira, já resolvida contra o catálogo e sem os zerados.
 *
 * Item que chegou a zero continua no documento como `0` — o `$inc` não
 * apaga campo. Esconder aqui é mais barato que limpar o banco a cada uso,
 * e evita a bolsa mostrar "Gema: 0" para sempre depois do primeiro gasto.
 *
 * @returns {Array<{ item: object, quantidade: number }>}
 */
function listar(user) {
    const linhas = Object.values(itens.ITENS)
        .map((item) => ({ item, quantidade: quantidadeDe(user, item.chave), tipo: 'item' }));

    // As caixas aparecem na mesma lista, depois dos itens: para o jogador
    // é tudo "o que eu tenho guardado", e separar em duas telas só faria
    // ele procurar a caixa comprada em dois lugares.
    const dasCaixas = caixas.todas().map((caixa) => ({
        item: caixa,
        quantidade: quantidadeDe(user, caixas.chaveNaBolsa(caixa.chave)),
        tipo: 'caixa'
    }));

    return [...linhas, ...dasCaixas]
        .filter((linha) => linha.quantidade > 0)
        .sort((a, b) => {
            if (a.tipo !== b.tipo) return a.tipo === 'item' ? -1 : 1;
            return a.item.ordem - b.item.ordem;
        });
}

/** A bolsa está vazia? */
function estaVazia(user) {
    return listar(user).length === 0;
}

module.exports = {
    ErroDeBolsa,
    adicionar,
    consumir,
    quantidadeDe,
    listar,
    estaVazia
};
