const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    lastRoll: {
        type: Number,
        default: 0
    },
    inventory: [{
        cardId: mongoose.Schema.Types.ObjectId,
        originalCardId: mongoose.Schema.Types.ObjectId,
        name: String,
        series: String,
        seriesImage: String,
        baseImage: String,
        characterImage: String,
        rarity: String,
        overall: Number,
        ATA: Number,
        LIF: Number,
        POW: Number,
        obtainedAt: { type: Date, default: Date.now },
        marketValue: Number,
        valueToSell: Number
    }],
    balance: {
        type: Number,
        default: 0
    },
    wins: {
        type: Number,
        default: 0
    },
    losses: {
        type: Number,
        default: 0
    },
    lastDaily: {
        type: Date,
    },
    favCard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Card'
    },
    // Pokédex: ids das cartas do catálogo que o jogador já teve em mãos
    // pelo menos uma vez. É um registro permanente — vender a carta não
    // apaga a descoberta, igual à Pokédex de Pokémon.
    discovered: [{
        cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card' },
        firstObtainedAt: { type: Date, default: Date.now }
    }],
    // Assinatura VIP. expiresAt nulo significa vitalício.
    vip: {
        tier: { type: String, default: null },
        since: { type: Date, default: null },
        expiresAt: { type: Date, default: null }
    },
    // Cosméticos equipados. Ficam salvos mesmo se o VIP expirar — só
    // deixam de ser aplicados até a assinatura voltar.
    cosmetics: {
        moldura: { type: String, default: 'nenhuma' },
        corPerfil: { type: Number, default: null },
        banner: { type: String, default: null }
    },

    // Sequência de dias coletando o /daily. Zera se pular um dia.
    streak: {
        atual: { type: Number, default: 0 },
        maior: { type: Number, default: 0 },
        ultimoDia: { type: String, default: null }  // 'AAAA-MM-DD'
    },

    // Cartas do catálogo que o jogador quer. Quando alguém rola uma
    // delas, ele é avisado.
    wishlist: [{
        cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card' },
        adicionadaEm: { type: Date, default: Date.now }
    }],

    // Pontuação de batalha. Separada de wins/losses porque esses contam
    // qualquer duelo, e o rank só conta partida valendo pontos.
    elo: { type: Number, default: 1000 },
    picoElo: { type: Number, default: 1000 },

    // Troféus conquistados (chave do catálogo em achievements.js).
    conquistas: [{
        chave: String,
        desbloqueadaEm: { type: Date, default: Date.now }
    }],

    // Contadores acumulados. São a fonte de verdade das conquistas e das
    // missões — em vez de cada feature recontar o inventário toda hora,
    // os comandos incrementam aqui quando a ação acontece.
    stats: {
        rolls: { type: Number, default: 0 },
        batalhasVencidas: { type: Number, default: 0 },
        batalhasPerdidas: { type: Number, default: 0 },
        trocasFeitas: { type: Number, default: 0 },
        vendasMercado: { type: Number, default: 0 },
        comprasMercado: { type: Number, default: 0 },
        moedasGanhas: { type: Number, default: 0 },
        moedasGastas: { type: Number, default: 0 },
        criticos: { type: Number, default: 0 },
        viradas: { type: Number, default: 0 },
        torneiosVencidos: { type: Number, default: 0 },
        diasAtivos: { type: Number, default: 0 }
    },

    // Suspensão administrativa, aplicada pelo painel do site.
    //
    // Ficar no próprio documento do usuário (em vez de numa coleção
    // separada) faz o bot descobrir o banimento na mesma consulta que já
    // faria de qualquer jeito, sem custo extra por comando.
    banimento: {
        ativo: { type: Boolean, default: false },
        motivo: { type: String, default: null },
        aplicadoEm: { type: Date, default: null },
        aplicadoPor: { type: String, default: null },
        // Nulo com ativo=true significa banimento permanente.
        expiraEm: { type: Date, default: null }
    },

    // Missões ativas. Regeneradas quando o período vira.
    missoes: {
        diarias: [{
            chave: String,
            progresso: { type: Number, default: 0 },
            alvo: Number,
            resgatada: { type: Boolean, default: false }
        }],
        semanais: [{
            chave: String,
            progresso: { type: Number, default: 0 },
            alvo: Number,
            resgatada: { type: Boolean, default: false }
        }],
        diaGerado: { type: String, default: null },     // 'AAAA-MM-DD'
        semanaGerada: { type: String, default: null }   // 'AAAA-Wnn'
    }
});

UserSchema.index({ balance: -1 });
UserSchema.index({ 'discovered.cardId': 1 });
UserSchema.index({ elo: -1 });
UserSchema.index({ 'wishlist.cardId': 1 });
// Índice PARCIAL, não sparse: `banimento.ativo` tem default false, então
// o campo existe em todo documento e um índice sparse indexaria a base
// inteira. Com partialFilterExpression só os banidos entram, e o índice
// fica com algumas dezenas de entradas em vez de milhares.
UserSchema.index(
    { 'banimento.ativo': 1 },
    { partialFilterExpression: { 'banimento.ativo': true } }
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = User;
