const Transacao = require('./transacaoSchema');

/**
 * Registro do que acontece na economia.
 *
 * ## A regra de ouro: registrar NUNCA pode derrubar a operação
 *
 * Toda função aqui engole o próprio erro. Se o banco estiver lento ou a
 * coleção indisponível, o jogador ainda compra, desmancha e aprimora — ele
 * só não fica com a linha no extrato.
 *
 * O contrário seria muito pior: um erro no livro-razão impedindo alguém de
 * gastar a moeda que já foi debitada. O razão é observação, não é a fonte
 * da verdade — a fonte continua sendo o saldo e a bolsa.
 *
 * ## Registrar DEPOIS, sempre
 *
 * Todas as chamadas ficam depois da escrita que elas descrevem. Registrar
 * antes criaria linha para operação que falhou, e um extrato que mente é
 * pior que extrato nenhum: ele é usado para investigar fraude.
 */

/**
 * Os tipos conhecidos.
 *
 * Não é uma trava — o schema aceita qualquer string, e é isso que permite
 * um tipo novo (roll comprado, skin, XP) entrar sem migração. A lista
 * existe para o painel saber traduzir e agrupar.
 */
const TIPOS = {
    compra: 'Compra na loja',
    desmanche: 'Desmanche de carta',
    aprimoramento: 'Tentativa de aprimoramento',
    venda_rapida: 'Venda rápida',
    mercado_venda: 'Venda no mercado',
    mercado_compra: 'Compra no mercado',
    admin: 'Ajuste administrativo'
};

/**
 * Grava uma linha do razão.
 *
 * Sem `await` obrigatório de quem chama: devolve a Promise para os testes,
 * mas o uso normal é dispará-la e seguir.
 *
 * @param {object} dados
 * @param {string} dados.userId
 * @param {string} dados.tipo
 * @param {Array<{chave: string, quantidade: number}>} [dados.itens]
 * @param {number} [dados.moedaDelta]  negativo quando o jogador gastou
 * @param {number} [dados.saldoDepois]
 * @param {object} [dados.contexto]
 */
async function registrar({
    userId,
    tipo,
    itens = [],
    moedaDelta = 0,
    saldoDepois = null,
    contexto = {}
} = {}) {
    if (!userId || !tipo) return null;

    try {
        return await Transacao.create({
            userId: String(userId),
            tipo,
            itens: itens
                .filter((i) => i && i.chave && Number(i.quantidade))
                .map((i) => ({ chave: String(i.chave), quantidade: Number(i.quantidade) })),
            moedaDelta: Number(moedaDelta) || 0,
            saldoDepois: Number.isFinite(Number(saldoDepois)) ? Number(saldoDepois) : null,
            contexto,
            em: new Date()
        });
    } catch (err) {
        // Ver o cabeçalho: o razão nunca derruba a operação que descreve.
        console.error('Erro ao registrar transação (operação não afetada):', err.message);
        return null;
    }
}

/** Atalho para a linha de compra na loja. */
function compra({ userId, item, quantidade, total, saldoDepois }) {
    return registrar({
        userId,
        tipo: 'compra',
        itens: [{ chave: item, quantidade }],
        moedaDelta: -Math.abs(Number(total) || 0),
        saldoDepois,
        contexto: { precoUnitario: quantidade > 0 ? Math.round(total / quantidade) : total }
    });
}

/**
 * Extrato de um jogador, do mais recente para o mais antigo.
 *
 * Limitado sempre: a ficha do painel mostra as últimas dezenas, não o
 * histórico inteiro — que pode ter milhares de linhas.
 */
async function extrato(userId, limite = 50) {
    try {
        return await Transacao.find({ userId: String(userId) })
            .sort({ em: -1 })
            .limit(Math.min(Math.max(1, limite), 500))
            .lean();
    } catch (err) {
        console.error('Erro ao ler extrato:', err.message);
        return [];
    }
}

/**
 * Totais por tipo num período.
 *
 * É o que responde "quanta moeda a loja tirou de circulação essa semana",
 * que hoje só dá para estimar.
 */
async function resumoPorTipo(desde) {
    try {
        return await Transacao.aggregate([
            { $match: { em: { $gte: desde } } },
            {
                $group: {
                    _id: '$tipo',
                    linhas: { $sum: 1 },
                    moeda: { $sum: '$moedaDelta' },
                    jogadores: { $addToSet: '$userId' }
                }
            },
            {
                $project: {
                    linhas: 1,
                    moeda: 1,
                    jogadores: { $size: '$jogadores' }
                }
            },
            { $sort: { linhas: -1 } }
        ]);
    } catch (err) {
        console.error('Erro ao resumir transações:', err.message);
        return [];
    }
}

module.exports = {
    TIPOS,
    registrar,
    compra,
    extrato,
    resumoPorTipo
};
