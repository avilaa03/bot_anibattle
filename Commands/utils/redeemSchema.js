const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Códigos de resgate, e o registro de quem resgatou o quê.
 *
 * ## Por que são DUAS coleções
 *
 * A tentação é guardar `usadoPor` no próprio código e acabar. Funciona
 * enquanto todo código for de uso único — e quebra no primeiro código de
 * campanha ("RESGATE 500 moedas, vale para os 200 primeiros"), que é
 * exatamente o tipo de coisa que se quer fazer com um sistema de código.
 *
 * Com o resgate numa coleção própria, o **índice único `(codigo, userId)`**
 * passa a ser a trava: o banco recusa o segundo resgate do mesmo jogador
 * sem nenhuma leitura antes, então não existe janela entre conferir e
 * gravar. É a mesma ideia do `providerPaymentId` único do `paymentSchema`.
 *
 * Ela também guarda o que a outra não tem como guardar: QUANDO cada um
 * resgatou, o que já foi entregue, e o erro quando a entrega parou no meio.
 */

// ---------------------------------------------------------------------
// O código
// ---------------------------------------------------------------------

const recompensaSchema = new Schema({
    // 'vip' | 'moedas' | 'item' | 'caixa' | 'carta' — ver utils/rewards.js
    tipo: { type: String, required: true },
    // Os parâmetros do tipo, já validados e normalizados na criação.
    params: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

const codigoSchema = new Schema({
    codigo: { type: String, required: true, unique: true, uppercase: true, trim: true },

    // O que ele entrega. Lista, para um código poder ser um pacote.
    recompensas: { type: [recompensaSchema], required: true },

    /**
     * De onde ele veio: 'mercadopago' | 'painel' | 'evento' | 'parceria'.
     *
     * Serve para responder "quanto do que saiu foi vendido e quanto foi
     * dado" sem precisar cruzar com o extrato — pergunta que aparece na
     * primeira vez que a economia parecer estranha.
     */
    origem: { type: String, default: 'painel', index: true },

    /** Liga ao mundo de fora: id do pagamento, do pedido ou da campanha. */
    referencia: { type: String, default: null, index: true },

    usos: { type: Number, default: 0 },
    usosMaximos: { type: Number, default: 1, min: 1 },

    /**
     * Cancelamento em vez de exclusão.
     *
     * Apagar um código estornado apagaria junto o rastro de que ele
     * existiu — e é justamente esse rastro que responde ao jogador que
     * jura ter recebido um código válido.
     */
    cancelado: { type: Boolean, default: false },
    motivoCancelamento: { type: String, default: null },

    expiraEm: { type: Date, default: null },
    criadoEm: { type: Date, default: Date.now },
    /** Discord ID de quem gerou, ou 'sistema' quando veio do webhook. */
    criadoPor: { type: String, default: 'sistema' },
    observacao: { type: String, default: null }
});

// Listagem do painel: os mais recentes primeiro.
codigoSchema.index({ criadoEm: -1 });

// ---------------------------------------------------------------------
// O resgate
// ---------------------------------------------------------------------

const resgateSchema = new Schema({
    codigo: { type: String, required: true, uppercase: true, trim: true },
    userId: { type: String, required: true, index: true },

    /**
     * 'entregando' | 'concluido' | 'falhou'
     *
     * O estado existe porque a entrega NÃO é atômica: um código que dá
     * VIP + caixa + moedas são três escritas em lugares diferentes, e o
     * processo pode morrer entre elas. Sem estado, um resgate pela metade
     * fica indistinguível de um completo.
     */
    estado: { type: String, default: 'entregando', index: true },

    /**
     * Os ÍNDICES das recompensas já aplicadas.
     *
     * É o que torna a reentrega segura: mandar de novo pula o que já saiu,
     * em vez de dar a caixa duas vezes para consertar as moedas que
     * faltaram. Índice e não chave porque a mesma recompensa pode aparecer
     * duas vezes no mesmo código.
     */
    entregues: { type: [Number], default: [] },

    erro: { type: String, default: null },
    criadoEm: { type: Date, default: Date.now },
    concluidoEm: { type: Date, default: null }
});

/**
 * A trava principal do sistema.
 *
 * Um jogador, um resgate por código — decidido pelo banco, na escrita.
 * Conferir antes em JavaScript deixaria uma janela entre a leitura e a
 * gravação, e dois cliques rápidos passariam os dois.
 */
resgateSchema.index({ codigo: 1, userId: 1 }, { unique: true });
resgateSchema.index({ criadoEm: -1 });

const Codigo = mongoose.models.Codigo || mongoose.model('Codigo', codigoSchema);
const Resgate = mongoose.models.Resgate || mongoose.model('Resgate', resgateSchema);

module.exports = { Codigo, Resgate };
