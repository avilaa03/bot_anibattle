const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cardSchema = new Schema({
    // Número na Pokédex. Fixo para sempre depois de atribuído — é o que
    // permite dizer "carta #042" e a pessoa achar a mesma carta amanhã.
    // Cartas novas recebem o próximo número livre, nunca reaproveitam.
    numero: {
        type: Number,
        default: null
    },
    name: {
        type: String,
        required: true
    },
    series: {
        type: String,
        required: true
    },
    seriesImage: {
        type: String,
        default: ''
    },
    baseImage: {
        type: String,
        default: ''
    },
    characterImage: {
        type: String,
        required: true
    },
    rarity: {
        type: String,
        required: true
    },
    overall: {
        type: Number,
        required: true
    },
    ATA: {
        type: Number,
        required: true
    },
    LIF: {
        type: Number,
        required: true
    },
    POW: {
        type: Number,
        required: true
    },

    /**
     * De onde a carta vem.
     *
     * 'roll' é o catálogo normal. 'evento' são as distribuídas à mão —
     * beta, campanha, prêmio de torneio. Serve para a Pokédex separada e
     * para o painel filtrar.
     */
    origem: {
        type: String,
        default: 'roll'
    },

    /**
     * A carta pode sair de um sorteio?
     *
     * Carta de evento entra com `false`. Na prática ela já estaria fora,
     * porque a raridade `event` nunca aparece em `sorteio.tabelaDeChances`
     * nem na distribuição de nenhuma caixa — este campo é a segunda trava,
     * e serve também para tirar de rotação uma carta normal sem apagá-la.
     */
    distribuivel: {
        type: Boolean,
        default: true
    },

    /**
     * A carta pode trocar de mãos?
     *
     * `false` bloqueia mercado, venda rápida, troca e transferência. É o
     * "vinculado" dos RPGs: a carta é sua e não vira mercadoria.
     *
     * ⚠️ Este valor é COPIADO para a cópia do inventário no momento da
     * entrega, e é a cópia que manda. Mudar aqui depois não afeta quem já
     * recebeu — ninguém perde o direito de vender algo que ganhou sob
     * outra regra.
     */
    comercializavel: {
        type: Boolean,
        default: true
    }
}, { collection: 'new-cards' });

cardSchema.index({ rarity: 1 });
// sparse: cartas ainda sem número não conflitam entre si no índice único.
cardSchema.index({ numero: 1 }, { unique: true, sparse: true });

// `mongoose.models.Card ||` é rede de segurança: se este arquivo for
// carregado duas vezes (require com grafia diferente do caminho, ou hot
// reload), reaproveita o model já compilado em vez de estourar
// "Cannot overwrite `Card` model once compiled".
const Card = mongoose.models.Card || mongoose.model('Card', cardSchema);

module.exports = Card;
