const mongoose = require('mongoose');

/**
 * Eventos com premiação.
 *
 * ## Quem escreve o quê
 *
 * O **painel do site** cria o evento, define os prêmios e distribui.
 * O **bot** só lê a lista de eventos abertos e acrescenta o jogador aos
 * participantes quando ele usa `/evento entrar`.
 *
 * A entrega dos prêmios NÃO acontece aqui. É de propósito: premiação é a
 * operação mais perigosa do sistema (cria carta e moeda em massa) e ter
 * dois lugares capazes de pagar seria ter duas chances de pagar duas
 * vezes. O bot inscreve; o painel paga.
 *
 * ## `premiado` é a trava
 *
 * O painel só paga participante com `premiado: false`, e a marca é posta
 * pela mesma escrita que reserva o pagamento. Se o bot algum dia
 * precisar mexer nesse campo, precisa usar a mesma disciplina.
 */

const participanteSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    entrouEm: { type: Date, default: Date.now },
    premiado: { type: Boolean, default: false },
    premiadoEm: { type: Date, default: null }
}, { _id: false });

const eventoSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    descricao: { type: String, default: '' },

    // direto    — o admin escolhe quem recebe, pelo painel
    // inscricao — o jogador entra pelo /evento
    // lote      — lista colada de uma vez, sem inscrição
    tipo: { type: String, enum: ['direto', 'inscricao', 'lote'], default: 'direto' },

    status: { type: String, enum: ['rascunho', 'aberto', 'encerrado'], default: 'rascunho' },

    premios: {
        moedas: { type: Number, default: 0 },
        cartas: [{
            cartaId: String,
            nome: String,
            raridade: String,
            quantidade: { type: Number, default: 1 }
        }],
        // Map, e não objeto solto: as chaves de item são dinâmicas
        // (`gema`, `pergaminho`, `caixa_elite`…) e um objeto comum faria
        // o Mongoose descartar o que não estivesse declarado aqui.
        itens: { type: Map, of: Number, default: () => new Map() }
    },

    participantes: { type: [participanteSchema], default: [] },

    criadoEm: { type: Date, default: Date.now },
    criadoPor: { type: String, default: '' },
    encerradoEm: { type: Date, default: null }
}, {
    // O painel do site escreve nesta mesma coleção pelo driver nativo.
    // O nome precisa bater exatamente — sem isso o bot leria uma coleção
    // vazia e o `/evento` nunca mostraria nada.
    collection: 'eventos'
});

// O /evento consulta sempre por tipo + status.
eventoSchema.index({ tipo: 1, status: 1 });

module.exports = mongoose.models.Evento || mongoose.model('Evento', eventoSchema);
