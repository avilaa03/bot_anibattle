const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const participante = new Schema({
    id: String,
    username: String,
    // Deck escolhido no momento da inscrição. Congelar aqui evita ter que
    // pedir o deck de novo a cada rodada e mantém o torneio justo.
    deck: [{
        _id: Schema.Types.ObjectId,
        name: String,
        series: String,
        rarity: String,
        overall: Number,
        ATA: Number,
        LIF: Number,
        POW: Number
    }],
    eliminado: { type: Boolean, default: false }
}, { _id: false });

const tournamentSchema = new Schema({
    tournamentId: { type: String, required: true, unique: true },

    guildId: String,
    canalId: String,
    mensagemId: String,

    criadorId: String,
    nome: { type: String, default: 'Torneio AniBattle' },

    taxaInscricao: { type: Number, default: 0 },
    premio: { type: Number, default: 0 },
    vagas: { type: Number, default: 8 },

    participantes: [participante],

    // inscricoes → emandamento → concluido/cancelado
    fase: { type: String, default: 'inscricoes' },
    rodadaAtual: { type: Number, default: 0 },
    campeaoId: { type: String, default: null },

    // Histórico das chaves, para poder mostrar o caminho até a final.
    rodadas: [{
        numero: Number,
        confrontos: [{
            aId: String,
            aNome: String,
            bId: String,
            bNome: String,
            vencedorId: String,
            placar: String
        }]
    }],

    criadoEm: { type: Date, default: Date.now }
});

tournamentSchema.index({ guildId: 1, fase: 1 });
tournamentSchema.index({ criadoEm: 1 });

module.exports = mongoose.models.Tournament || mongoose.model('Tournament', tournamentSchema);
