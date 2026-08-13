const crypto = require('crypto');
const { Codigo, Resgate } = require('./redeemSchema');
const rewards = require('./rewards');

/**
 * Códigos de resgate.
 *
 * Um código é um portador: quem tem o texto tem o direito. Isso é
 * proposital — é o que permite vender sem saber o Discord de quem compra,
 * presentear, e premiar campanha. E é também o que obriga o formato a ser
 * impossível de adivinhar.
 *
 * ## O alfabeto não tem 0, O, 1, I nem L
 *
 * O jogador digita o código à mão, olhando para um print ou para o e-mail
 * da compra. `0` e `O` são o mesmo rabisco em quase toda fonte, e cada
 * confusão dessas vira uma mensagem no seu privado. Tirar os ambíguos
 * custa 4 símbolos de entropia e economiza suporte.
 *
 * Sobram 30 símbolos em 12 posições: 30^12 ≈ 5×10^17 combinações. Mesmo
 * com um milhão de códigos vivos, um chute tem chance de 1 em 500 bilhões
 * — e ainda assim o comando limita tentativas, porque entropia protege
 * contra sorte e não contra alguém rodando um script a noite inteira.
 *
 * ## A ordem das duas reservas importa
 *
 * O resgate reserva o JOGADOR antes de reservar o USO do código. Ao
 * contrário, um jogador que já tivesse resgatado consumiria um uso ao
 * tentar de novo — e um código de 200 usos seria zerado por 200 cliques
 * repetidos de uma pessoa só.
 */

const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const GRUPOS = 3;
const TAMANHO_GRUPO = 4;
const PREFIXO = 'ANI';

/** `ANI-7K4M-9QP2-XR3T` */
const FORMATO = new RegExp(
    `^${PREFIXO}(-[${ALFABETO}]{${TAMANHO_GRUPO}}){${GRUPOS}}$`
);

/**
 * Deixa o que o jogador digitou no formato canônico.
 *
 * Ele vai colar com espaço sobrando, em minúscula, e às vezes sem os
 * hífens (porque copiou de um lugar que os comeu). Recusar qualquer uma
 * dessas formas seria recusar um código legítimo.
 */
function normalizar(bruto) {
    const limpo = String(bruto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!limpo.startsWith(PREFIXO)) return limpo;

    const corpo = limpo.slice(PREFIXO.length);
    const partes = [];
    for (let i = 0; i < corpo.length; i += TAMANHO_GRUPO) {
        partes.push(corpo.slice(i, i + TAMANHO_GRUPO));
    }
    return [PREFIXO, ...partes].join('-');
}

function ehFormatoValido(codigo) {
    return FORMATO.test(codigo);
}

/**
 * Gera um código novo.
 *
 * `randomInt` do `crypto`, não `Math.random`: o gerador padrão do
 * JavaScript é previsível a partir de saídas anteriores, e um código de
 * resgate previsível é dinheiro de graça para quem descobrir o padrão.
 * Também é uniforme — `Math.random() * 31 | 0` enviesa os primeiros
 * símbolos, o que reduz o espaço real de busca.
 */
function gerarCodigo() {
    const grupos = [];
    for (let g = 0; g < GRUPOS; g++) {
        let grupo = '';
        for (let i = 0; i < TAMANHO_GRUPO; i++) {
            grupo += ALFABETO[crypto.randomInt(0, ALFABETO.length)];
        }
        grupos.push(grupo);
    }
    return [PREFIXO, ...grupos].join('-');
}

/**
 * Cria um código no banco.
 *
 * As recompensas são validadas ANTES de qualquer escrita: um código
 * malformado precisa falhar na tela de quem o está criando, não na do
 * jogador que já pagou por ele.
 *
 * @param {object} opcoes
 * @param {Array}  opcoes.recompensas  ver `utils/rewards.js`
 * @param {string} [opcoes.origem]     'mercadopago' | 'painel' | 'evento' | 'parceria'
 * @param {string} [opcoes.referencia] id do pagamento, do pedido ou da campanha
 * @param {number} [opcoes.usosMaximos]
 * @param {number} [opcoes.validadeDias] null = não expira
 * @param {string} [opcoes.criadoPor]
 * @param {string} [opcoes.observacao]
 */
async function criar({
    recompensas,
    origem = 'painel',
    referencia = null,
    usosMaximos = 1,
    validadeDias = 365,
    criadoPor = 'sistema',
    observacao = null
} = {}) {
    const validadas = rewards.validarLista(recompensas);

    const usos = Math.max(1, Math.floor(Number(usosMaximos) || 1));
    const expiraEm = validadeDias
        ? new Date(Date.now() + Number(validadeDias) * 24 * 60 * 60 * 1000)
        : null;

    // Colisão de código é astronomicamente improvável, mas o índice único
    // a torna impossível de passar despercebida — e três tentativas
    // resolvem sem que ninguém veja um erro.
    for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
            return await Codigo.create({
                codigo: gerarCodigo(),
                recompensas: validadas,
                origem,
                referencia,
                usosMaximos: usos,
                expiraEm,
                criadoPor,
                observacao
            });
        } catch (err) {
            if (err.code !== 11000) throw err;
        }
    }
    throw new Error('Não consegui gerar um código único em 3 tentativas.');
}

/**
 * Resgata um código para um jogador.
 *
 * Nunca lança por motivo de negócio: devolve `{ ok: false, motivo }` e
 * quem chama traduz. Exceção só para falha técnica de verdade, que precisa
 * chegar ao monitoramento.
 *
 * @returns {Promise<{ok: boolean, motivo?: string, recompensas?: Array, entregues?: number}>}
 */
async function resgatar(userId, codigoBruto) {
    const codigo = normalizar(codigoBruto);
    if (!ehFormatoValido(codigo)) return { ok: false, motivo: 'FORMATO' };

    const doc = await Codigo.findOne({ codigo }).lean();

    // Resposta idêntica para código inexistente e para código cancelado.
    //
    // Distinguir os dois entregaria um oráculo: quem estivesse varrendo
    // códigos saberia quais existem, e "existe mas está cancelado" é uma
    // pista de que a vizinhança do espaço de busca tem códigos válidos.
    if (!doc || doc.cancelado) return { ok: false, motivo: 'INVALIDO' };
    if (doc.expiraEm && new Date(doc.expiraEm).getTime() <= Date.now()) {
        return { ok: false, motivo: 'EXPIRADO' };
    }

    // ---- Reserva 1: o jogador ----
    //
    // O índice único (codigo, userId) é quem decide. Duplicado aqui
    // significa que este jogador já passou por este código antes.
    let resgate;
    try {
        resgate = await Resgate.create({ codigo, userId, estado: 'entregando' });
    } catch (err) {
        if (err.code !== 11000) throw err;
        const anterior = await Resgate.findOne({ codigo, userId }).lean();
        return {
            ok: false,
            motivo: anterior?.estado === 'concluido' ? 'JA_RESGATADO' : 'ENTREGA_PENDENTE'
        };
    }

    // ---- Reserva 2: um uso do código ----
    //
    // `$expr` compara dois campos do MESMO documento na hora da escrita.
    // Ler `usosMaximos` antes e comparar aqui no Node deixaria a janela
    // que dois resgates simultâneos atravessariam no último uso.
    const reservado = await Codigo.findOneAndUpdate(
        {
            codigo,
            cancelado: { $ne: true },
            $expr: { $lt: ['$usos', '$usosMaximos'] }
        },
        { $inc: { usos: 1 } },
        { new: true }
    );

    if (!reservado) {
        // Devolve a vaga do jogador: ele não consumiu nada, e recusar o
        // resgate dele para sempre por um código que acabou seria punir a
        // pessoa errada.
        await Resgate.deleteOne({ _id: resgate._id }).catch(() => {});
        return { ok: false, motivo: 'ESGOTADO' };
    }

    // ---- Entrega ----
    //
    // Uma a uma, marcando o índice logo depois de cada uma. É uma escrita
    // a mais por recompensa, e é ela que permite reprocessar um resgate
    // travado sem entregar de novo o que já saiu.
    const entregues = [];
    const contexto = { codigo, origem: doc.origem };

    for (let i = 0; i < doc.recompensas.length; i++) {
        try {
            const detalhe = await rewards.entregar(userId, doc.recompensas[i], contexto);
            await Resgate.updateOne({ _id: resgate._id }, { $addToSet: { entregues: i } });
            entregues.push({ ...doc.recompensas[i], detalhe });
        } catch (err) {
            // O código JÁ foi consumido, e parte já pode ter sido entregue.
            //
            // Devolver o uso aqui seria pior: o jogador resgataria de novo
            // e receberia em dobro o que deu certo. O resgate fica marcado
            // como falho, aparece na lista de pendências, e é reprocessado
            // pulando o que já saiu.
            await Resgate.updateOne(
                { _id: resgate._id },
                { $set: { estado: 'falhou', erro: String(err.message).slice(0, 500) } }
            );
            console.error(`Resgate ${codigo} falhou na recompensa ${i} de ${userId}:`, err.message);
            return { ok: false, motivo: 'FALHA_PARCIAL', recompensas: entregues, erro: err.message };
        }
    }

    await Resgate.updateOne(
        { _id: resgate._id },
        { $set: { estado: 'concluido', concluidoEm: new Date() } }
    );

    return {
        ok: true,
        recompensas: entregues,
        restantes: Math.max(0, reservado.usosMaximos - reservado.usos)
    };
}

/**
 * Reprocessa um resgate que parou no meio.
 *
 * Só entrega o que ainda não saiu — é para isto que `entregues` guarda
 * índices. Feito para o painel administrativo, depois de você olhar o erro
 * e resolver a causa.
 */
async function reprocessar(codigo, userId) {
    const resgate = await Resgate.findOne({ codigo: normalizar(codigo), userId });
    if (!resgate) return { ok: false, motivo: 'SEM_RESGATE' };
    if (resgate.estado === 'concluido') return { ok: false, motivo: 'JA_CONCLUIDO' };

    const doc = await Codigo.findOne({ codigo: resgate.codigo }).lean();
    if (!doc) return { ok: false, motivo: 'INVALIDO' };

    const contexto = { codigo: resgate.codigo, origem: doc.origem };
    const entregues = [];

    for (let i = 0; i < doc.recompensas.length; i++) {
        if (resgate.entregues.includes(i)) continue;
        try {
            const detalhe = await rewards.entregar(userId, doc.recompensas[i], contexto);
            await Resgate.updateOne({ _id: resgate._id }, { $addToSet: { entregues: i } });
            entregues.push({ ...doc.recompensas[i], detalhe });
        } catch (err) {
            await Resgate.updateOne(
                { _id: resgate._id },
                { $set: { erro: String(err.message).slice(0, 500) } }
            );
            return { ok: false, motivo: 'FALHA_PARCIAL', recompensas: entregues, erro: err.message };
        }
    }

    await Resgate.updateOne(
        { _id: resgate._id },
        { $set: { estado: 'concluido', concluidoEm: new Date(), erro: null } }
    );
    return { ok: true, recompensas: entregues };
}

/** Cancela um código. Resgates já feitos não são desfeitos. */
async function cancelar(codigo, motivo = 'cancelado') {
    return Codigo.findOneAndUpdate(
        { codigo: normalizar(codigo) },
        { $set: { cancelado: true, motivoCancelamento: motivo } },
        { new: true }
    );
}

module.exports = {
    ALFABETO,
    PREFIXO,
    FORMATO,
    normalizar,
    ehFormatoValido,
    gerarCodigo,
    criar,
    resgatar,
    reprocessar,
    cancelar
};
