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
    // Proteção contra azar: rolls seguidos sem tirar a raridade em
    // questão ou melhor. Zeram sozinhos quando a sorte vem, e ao chegar no
    // limite o próximo roll vem garantido. Ver `utils/sorteio.js` para as
    // réguas (40 e 300) e o porquê de serem duas.
    //
    // Não existe contador de Mestra: ela é a única raridade sem rede, de
    // propósito. Mas quando sai, zera os dois — está acima dos dois.
    //
    // Quem já jogava começa em 0, e isso é de propósito: dar crédito
    // retroativo exigiria um histórico que o bot nunca guardou, e chutar
    // pelo inventário premiaria justamente quem teve sorte.
    rollsSemUltra: {
        type: Number,
        default: 0
    },
    rollsSemLendaria: {
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
        valueToSell: Number,
        // Nível de aprimoramento. Nunca negativo: o overall natural é o
        // chão absoluto, e carta que nunca subiu não tem o que perder.
        // Sem teto — ver `utils/aprimoramento.js`.
        nivel: { type: Number, default: 0 },
        // Os valores com que a carta nasceu.
        //
        // Precisa ficar gravado aqui, e não ser lido do catálogo: o painel
        // admin edita cartas do catálogo, e uma carta já aprimorada teria
        // seus atributos recalculados sobre uma base diferente da que ela
        // realmente teve. Ausente = a carta nunca subiu, e os valores
        // atuais são os naturais.
        base: {
            overall: Number,
            ATA: Number,
            LIF: Number,
            POW: Number
        }
    }],
    balance: {
        type: Number,
        default: 0
    },
    // Itens: quantos de cada. Map e não array de propósito — ver o
    // cabeçalho de `utils/bolsa.js`. Em resumo: `$inc` num Map cria o
    // campo se faltar e soma se existir, numa escrita só, e não há corrida
    // capaz de gerar duas entradas do mesmo item.
    bolsa: {
        type: Map,
        of: Number,
        default: () => new Map()
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

    // XP acumulado. O nível é DERIVADO dele (`utils/nivel.js`), nunca
    // gravado: dois campos que precisam concordar acabam discordando, e
    // aí não há como saber qual está certo.
    //
    // `nivelEntregue` é outra coisa: é até onde as recompensas já foram
    // pagas. Sem ele, um jogador que subisse de nível durante uma falha de
    // entrega receberia de novo na próxima ação — ou nunca receberia.
    xp: { type: Number, default: 0 },
    nivelEntregue: { type: Number, default: 1 },

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

    // Participação na beta.
    //
    // Marcado de uma vez por `scripts/marcarBeta.js`, não pelo bot em
    // tempo real: a régua de quem "jogou a beta" é uma decisão de produto
    // (quantos rolls contam?), e essa decisão precisa ser tomada uma vez,
    // registrada, e não reavaliada a cada comando.
    beta: {
        participou: { type: Boolean, default: false },
        // Quando o jogador entrou (primeira atividade conhecida).
        desde: { type: Date, default: null },
        // Fotografia do que ele tinha no momento da marcação. Fica aqui
        // para a decisão ser auditável depois — sem isso, daqui a um ano
        // ninguém sabe dizer por que fulano recebeu a carta e beltrano não.
        rollsNaEpoca: { type: Number, default: 0 },
        marcadoEm: { type: Date, default: null }
    },

    // Marca de equipe. Só muda pelo painel administrativo.
    staff: { type: Boolean, default: false },

    // Contadores que zeram quando o dia vira (compra de caixa, roll extra).
    //
    // Map de Map: `limites.caixa.usos.lendaria`. Map pelo mesmo motivo da
    // bolsa — `$inc` num caminho que ainda não existe cria o campo e soma
    // numa escrita só, e não há corrida capaz de gerar duplicata.
    //
    // Ver `utils/limiteDiario.js` para o porquê de não derivar isto do
    // livro-razão (resumo: o razão é best-effort, e limite que a falha
    // afrouxa não é limite).
    limites: {
        type: Map,
        of: new Schema({
            dia: String,
            usos: { type: Map, of: Number, default: () => new Map() }
        }, { _id: false }),
        default: () => new Map()
    },

    // Telemetria de comportamento do /roll.
    //
    // Só MEDE — nada aqui pune, bloqueia ou aumenta cooldown. Ver
    // `utils/telemetria.js` para o desenho e o motivo de ser agregado em
    // vez de guardar cada roll (seriam ~35 mil registros por jogador/ano).
    telemetria: {
        totalRolls: { type: Number, default: 0 },

        // Histograma de atividade por hora UTC. Map, e não array, porque
        // `$inc` numa posição de array que ainda não existe cria um
        // OBJETO no lugar do array e quebra a tipagem na leitura seguinte.
        porHora: { type: Map, of: Number, default: () => new Map() },

        // Quanto tempo depois do cooldown vencer o jogador rolou. Guardado
        // como somas para render média e desvio-padrão sem manter o bruto.
        pontualidade: {
            amostras: { type: Number, default: 0 },
            pontuais: { type: Number, default: 0 },
            somaAtraso: { type: Number, default: 0 },
            // Em segundos², não ms²: em ms o valor estoura a precisão do
            // double depois de alguns milhares de amostras.
            somaQuadrados: { type: Number, default: 0 }
        },

        // Tempo entre a carta aparecer e o botão ser clicado.
        cliques: {
            amostras: { type: Number, default: 0 },
            soma: { type: Number, default: 0 },
            rapidos: { type: Number, default: 0 }
        },

        // Janela curta para inspeção caso a caso no painel. Limitada pelo
        // próprio Mongo com $slice na escrita.
        ultimosRolls: [{
            em: Date,
            atrasoMs: Number,
            _id: false
        }]
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
// Fila de revisão do painel: quem tem mais rolls medidos primeiro.
UserSchema.index({ 'telemetria.pontualidade.amostras': -1 });
// Lista de quem recebe a carta da beta.
UserSchema.index(
    { 'beta.participou': 1 },
    { partialFilterExpression: { 'beta.participou': true } }
);
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
