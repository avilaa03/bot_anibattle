const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Livro-razão da economia.
 *
 * ## Por que existe
 *
 * Antes disto, nada registrava o que um jogador comprou. `/loja` debitava,
 * entregava e respondia; a `bolsa` guardava só o saldo atual. Era
 * impossível responder "o que essa pessoa comprou e quando?" — e pior,
 * impossível saber quanta moeda a loja realmente tirou de circulação, que
 * é o único jeito de medir se o sink está funcionando.
 *
 * Gema comprada e gema vinda do desmanche são indistinguíveis no saldo.
 * Sem o razão, essa informação não existe em lugar nenhum, e **não dá
 * para reconstruir depois** — cada dia sem isso é histórico perdido.
 *
 * ## Um documento por movimento, não por comando
 *
 * O mesmo `/aprimorar` gasta gema E pode gastar pergaminho. Em vez de um
 * schema por tipo de operação, cada linha carrega uma lista de itens e um
 * delta de moeda. Assim um tipo novo (roll comprado, skin, XP) entra sem
 * alterar o schema — foi exatamente o pedido.
 *
 * ## Por que os detalhes expiram em 90 dias
 *
 * Um jogador ativo gera dezenas de linhas por dia. Sem prazo, a coleção
 * cresce para sempre e a consulta da ficha fica cara justamente quando a
 * base cresce.
 *
 * 90 dias cobre a pergunta que se faz de verdade ("o que ele comprou
 * ultimamente?") e a investigação de fraude, que é sempre recente. Os
 * totais de vida inteira continuam em `users.stats` (`moedasGanhas`,
 * `moedasGastas`), que o TTL não toca.
 *
 * Se um dia for preciso guardar mais, o caminho é um resumo mensal
 * agregado — não aumentar o prazo daqui.
 */

/** Quanto tempo o detalhe fica guardado. */
const DIAS_DE_RETENCAO = 90;

const transacaoSchema = new Schema({
    userId: { type: String, required: true },

    /**
     * O que aconteceu. Aberto de propósito: tipo novo não precisa de
     * migração, só de uma constante em `utils/transacoes.js`.
     */
    tipo: { type: String, required: true },

    /**
     * Itens que entraram (quantidade positiva) ou saíram (negativa).
     * Vazio quando o movimento foi só de moeda.
     */
    itens: [{
        chave: String,
        quantidade: Number,
        _id: false
    }],

    /** Moeda que entrou (positivo) ou saiu (negativo) do bolso do jogador. */
    moedaDelta: { type: Number, default: 0 },

    /** Saldo depois do movimento, quando quem registrou sabia. */
    saldoDepois: { type: Number, default: null },

    /**
     * O que mais importa para entender a linha: nome e raridade da carta,
     * nível antes e depois, desfecho do aprimoramento. Mixed de propósito
     * — cada tipo guarda o que faz sentido para ele.
     */
    contexto: { type: Schema.Types.Mixed, default: {} },

    em: { type: Date, default: Date.now }
}, { collection: 'transacoes' });

// Extrato de um jogador, do mais recente para o mais antigo.
transacaoSchema.index({ userId: 1, em: -1 });
// Relatórios por período e por tipo.
transacaoSchema.index({ tipo: 1, em: -1 });

// TTL: o Mongo apaga sozinho quando `em` passa do prazo.
//
// ⚠️ O índice TTL só é criado na primeira vez. Mudar `DIAS_DE_RETENCAO`
// depois NÃO altera o índice existente — é preciso derrubá-lo à mão
// (`db.transacoes.dropIndex('em_1')`) e deixar o bot recriar.
transacaoSchema.index({ em: 1 }, { expireAfterSeconds: DIAS_DE_RETENCAO * 24 * 60 * 60 });

const Transacao = mongoose.models.Transacao || mongoose.model('Transacao', transacaoSchema);

module.exports = Transacao;
module.exports.DIAS_DE_RETENCAO = DIAS_DE_RETENCAO;
