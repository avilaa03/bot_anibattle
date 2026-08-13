/**
 * Códigos de resgate.
 *
 * ## O que este arquivo protege
 *
 * O resgate é a única parte do bot em que dinheiro real vira item de jogo,
 * e as três formas de errar aqui custam caro de jeitos diferentes:
 *
 * | Erro | Custo |
 * |---|---|
 * | Resgatar duas vezes | você entrega duas vezes o que vendeu uma |
 * | Consumir uso sem entregar | o cliente pagou e não recebeu |
 * | Aceitar recompensa inválida | falha na cara de quem já pagou |
 *
 * Os testes abaixo cobrem os três, com dublês em memória que respeitam as
 * MESMAS travas do Mongo — o índice único de `(codigo, userId)` e a
 * comparação `$expr` entre `usos` e `usosMaximos`. Um dublê frouxo aqui
 * provaria que o código funciona num banco que não existe.
 */

const path = require('path');
const UTILS = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

// ---------------------------------------------------------------------
// Dublês do banco
// ---------------------------------------------------------------------

let codigos = [];
let resgates = [];
let seq = 1;

/** Só o que o redeem.js realmente usa nos filtros. */
function casa(doc, filtro) {
    for (const [k, v] of Object.entries(filtro)) {
        if (k === '$expr') {
            // O único $expr do arquivo: usos < usosMaximos.
            const [a, b] = v.$lt;
            if (!(doc[a.slice(1)] < doc[b.slice(1)])) return false;
            continue;
        }
        if (k === '_id') { if (String(doc._id) !== String(v)) return false; continue; }
        const atual = doc[k];
        if (v && typeof v === 'object' && '$ne' in v) {
            if (atual === v.$ne) return false;
            continue;
        }
        if (atual !== v) return false;
    }
    return true;
}

function aplicar(doc, update) {
    if (update.$inc) for (const [k, n] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + n;
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$addToSet) {
        for (const [k, v] of Object.entries(update.$addToSet)) {
            doc[k] = doc[k] || [];
            if (!doc[k].includes(v)) doc[k].push(v);
        }
    }
    return doc;
}

const Codigo = {
    async create(o) {
        // Índice único em `codigo`.
        if (codigos.some((c) => c.codigo === o.codigo)) {
            const e = new Error('dup'); e.code = 11000; throw e;
        }
        const d = { usos: 0, usosMaximos: 1, cancelado: false, expiraEm: null, ...o, _id: seq++ };
        codigos.push(d);
        return d;
    },
    findOne(q) {
        const d = codigos.find((c) => casa(c, q));
        const r = d ? { ...d } : null;
        return { lean: async () => r, then: (f) => f(r) };
    },
    async findOneAndUpdate(q, u) {
        const d = codigos.find((c) => casa(c, q));
        if (!d) return null;
        return { ...aplicar(d, u) };
    }
};

const Resgate = {
    async create(o) {
        // O ÍNDICE ÚNICO (codigo, userId) — a trava principal do sistema.
        if (resgates.some((r) => r.codigo === o.codigo && r.userId === o.userId)) {
            const e = new Error('dup'); e.code = 11000; throw e;
        }
        const d = { entregues: [], erro: null, ...o, _id: seq++ };
        resgates.push(d);
        return d;
    },
    findOne(q) {
        const d = resgates.find((r) => casa(r, q));
        const r = d ? { ...d } : null;
        return { lean: async () => r, then: (f) => f(r) };
    },
    async updateOne(q, u) {
        const d = resgates.find((r) => casa(r, q));
        if (d) aplicar(d, u);
        return { modifiedCount: d ? 1 : 0 };
    },
    async deleteOne(q) {
        const i = resgates.findIndex((r) => casa(r, q));
        if (i >= 0) resgates.splice(i, 1);
        return { deletedCount: i >= 0 ? 1 : 0 };
    }
};

// ---------------------------------------------------------------------
// Dublê das recompensas
// ---------------------------------------------------------------------
//
// O catálogo de verdade escreve no banco. Aqui só registramos o que teria
// sido entregue — e `falharNo` permite simular a entrega que morre no meio,
// que é o caso mais difícil e o único que não dá para reproduzir à mão em
// produção sem estragar a conta de alguém.

const entregas = [];
let falharNo = null;

require.cache[require.resolve(UTILS + 'redeemSchema.js')] = { exports: { Codigo, Resgate } };
require.cache[require.resolve(UTILS + 'rewards.js')] = {
    exports: {
        validarLista: (lista) => lista.map((r) => ({ tipo: r.tipo, params: { ...r.params } })),
        async entregar(userId, recompensa) {
            if (falharNo !== null && entregas.length === falharNo) {
                throw new Error('falha simulada na entrega');
            }
            entregas.push({ userId, tipo: recompensa.tipo });
            return { ok: true };
        },
        descrever: (r) => r.tipo
    }
};

const redeem = require(UTILS + 'redeem.js');

// O catálogo DE VERDADE, sem dublê, para os testes de validação.
delete require.cache[require.resolve(UTILS + 'rewards.js')];
const rewardsReal = require(path.join(__dirname, '..', 'Commands', 'utils', 'rewards.js'));

(async () => {
    // -----------------------------------------------------------------
    console.log('=== Formato do código ===');

    const gerado = redeem.gerarCodigo();
    check('o gerado passa na própria validação', redeem.ehFormatoValido(gerado), `(${gerado})`);
    check('não tem caractere ambíguo (0 O 1 I L)',
        !/[01IL]/.test(gerado.replace('ANI-', '')), `(${gerado})`);

    // Colar de um lugar que comeu os hífens, ou em minúscula, é o caso
    // NORMAL — não a exceção. Recusar isso é recusar cliente pagante.
    check('normaliza sem hífen', redeem.normalizar('ani7k4m9qp2xr3t') === 'ANI-7K4M-9QP2-XR3T');
    check('normaliza com espaço e minúscula',
        redeem.normalizar('  ani-7k4m-9qp2-xr3t  ') === 'ANI-7K4M-9QP2-XR3T');
    check('recusa código curto', !redeem.ehFormatoValido('ANI-7K4M'));
    check('recusa prefixo errado', !redeem.ehFormatoValido('XXX-7K4M-9QP2-XR3T'));

    // 200 códigos sem repetir não prova unicidade, mas pega o erro real:
    // um gerador que esqueceu de sortear e devolve sempre o mesmo.
    const amostra = new Set(Array.from({ length: 200 }, () => redeem.gerarCodigo()));
    check('200 gerados são 200 diferentes', amostra.size === 200, `(${amostra.size})`);

    // -----------------------------------------------------------------
    console.log('\n=== Validação recusa configuração errada ANTES de vender ===');

    const recusa = (nome, recompensa) => {
        try {
            rewardsReal.validar(recompensa);
            check(nome, false, '<- aceitou o que devia recusar');
        } catch (err) {
            check(nome, err instanceof rewardsReal.ErroDeRecompensa, `(${err.message})`);
        }
    };

    recusa('tipo inexistente', { tipo: 'nave', params: {} });
    recusa('plano de VIP inexistente', { tipo: 'vip', params: { tier: 'diamante' } });
    recusa('caixa com acento', { tipo: 'caixa', params: { chave: 'lendária' } });
    recusa('item inventado', { tipo: 'item', params: { chave: 'espada' } });
    recusa('quantidade zero', { tipo: 'moedas', params: { quantidade: 0 } });
    recusa('quantidade negativa', { tipo: 'moedas', params: { quantidade: -50 } });
    recusa('moedas acima do teto', { tipo: 'moedas', params: { quantidade: 99_999_999 } });
    recusa('carta com id inválido', { tipo: 'carta', params: { cardId: 'nao-e-objectid' } });
    recusa('lista vazia', null);

    try {
        rewardsReal.validarLista([]);
        check('lista vazia é recusada', false);
    } catch {
        check('lista vazia é recusada', true);
    }

    const limpo = rewardsReal.validar({ tipo: 'vip', params: { tier: 'OURO', meses: '3' } });
    check('normaliza o que grava (tier minúsculo, meses número)',
        limpo.params.tier === 'ouro' && limpo.params.meses === 3,
        `(${JSON.stringify(limpo.params)})`);

    // -----------------------------------------------------------------
    console.log('\n=== Resgate feliz ===');

    const c1 = await redeem.criar({
        recompensas: [{ tipo: 'vip', params: { tier: 'ouro', meses: 3 } }, { tipo: 'moedas', params: { quantidade: 5000 } }]
    });

    const r1 = await redeem.resgatar('jogador-A', c1.codigo);
    check('resgate deu certo', r1.ok === true, r1.motivo || '');
    check('entregou as duas recompensas', r1.recompensas.length === 2);
    check('o resgate ficou como concluído',
        resgates.find((r) => r.userId === 'jogador-A')?.estado === 'concluido');
    check('marcou os dois índices como entregues',
        JSON.stringify(resgates.find((r) => r.userId === 'jogador-A')?.entregues) === '[0,1]');

    // -----------------------------------------------------------------
    console.log('\n=== O mesmo jogador não resgata duas vezes ===');

    const r2 = await redeem.resgatar('jogador-A', c1.codigo);
    check('segunda tentativa é recusada', r2.ok === false && r2.motivo === 'JA_RESGATADO', r2.motivo);
    check('não entregou nada de novo', entregas.length === 2, `(${entregas.length} entregas)`);
    check('o contador de usos não subiu de novo',
        codigos.find((c) => c.codigo === c1.codigo).usos === 1);

    // Código de uso único já usado por OUTRA pessoa: esgotado, não "já usou".
    const r3 = await redeem.resgatar('jogador-B', c1.codigo);
    check('outro jogador vê "esgotado"', r3.ok === false && r3.motivo === 'ESGOTADO', r3.motivo);
    check('a vaga do jogador-B foi devolvida',
        !resgates.some((r) => r.userId === 'jogador-B'),
        '<- resgate órfão bloquearia ele para sempre num código futuro');

    // -----------------------------------------------------------------
    console.log('\n=== Código de campanha, com vários usos ===');

    const c2 = await redeem.criar({
        recompensas: [{ tipo: 'moedas', params: { quantidade: 500 } }],
        usosMaximos: 3
    });

    const seq1 = await redeem.resgatar('p1', c2.codigo);
    const seq2 = await redeem.resgatar('p2', c2.codigo);
    const seq3 = await redeem.resgatar('p3', c2.codigo);
    const seq4 = await redeem.resgatar('p4', c2.codigo);

    check('os três primeiros conseguem', seq1.ok && seq2.ok && seq3.ok);
    check('o quarto é recusado', seq4.ok === false && seq4.motivo === 'ESGOTADO');
    check('o primeiro vê 2 usos restantes', seq1.restantes === 2, `(${seq1.restantes})`);
    check('o terceiro vê 0 restantes', seq3.restantes === 0, `(${seq3.restantes})`);
    check('repetido pelo mesmo jogador não gasta uso',
        (await redeem.resgatar('p1', c2.codigo)).motivo === 'JA_RESGATADO'
        && codigos.find((c) => c.codigo === c2.codigo).usos === 3);

    // -----------------------------------------------------------------
    console.log('\n=== Cancelado, vencido e inexistente ===');

    const c3 = await redeem.criar({ recompensas: [{ tipo: 'moedas', params: { quantidade: 100 } }] });
    await redeem.cancelar(c3.codigo, 'estorno');
    const rc = await redeem.resgatar('jogador-C', c3.codigo);
    check('código cancelado é recusado', rc.ok === false && rc.motivo === 'INVALIDO', rc.motivo);

    const inexistente = await redeem.resgatar('jogador-C', 'ANI-2222-3333-4444');
    check('inexistente devolve o MESMO motivo do cancelado',
        inexistente.motivo === 'INVALIDO',
        '<- motivos diferentes viram oráculo para quem varre códigos');

    const c4 = await redeem.criar({ recompensas: [{ tipo: 'moedas', params: { quantidade: 100 } }] });
    codigos.find((c) => c.codigo === c4.codigo).expiraEm = new Date(Date.now() - 1000);
    const rv = await redeem.resgatar('jogador-D', c4.codigo);
    check('código vencido é recusado', rv.ok === false && rv.motivo === 'EXPIRADO', rv.motivo);
    check('código vencido não consome uso',
        codigos.find((c) => c.codigo === c4.codigo).usos === 0);

    const rf = await redeem.resgatar('jogador-D', 'não é um código');
    check('texto sem formato nem consulta o banco', rf.motivo === 'FORMATO');

    // -----------------------------------------------------------------
    console.log('\n=== Entrega que morre no meio ===');
    //
    // O caso que importa de verdade: o código dá três coisas e a segunda
    // falha. O jogador PRECISA ficar com a primeira, e não pode conseguir
    // resgatar de novo — senão receberia a primeira duas vezes.

    const c5 = await redeem.criar({
        recompensas: [
            { tipo: 'moedas', params: { quantidade: 100 } },
            { tipo: 'caixa', params: { chave: 'elite', quantidade: 1 } },
            { tipo: 'item', params: { chave: 'gema', quantidade: 10 } }
        ]
    });

    const antes = entregas.length;
    falharNo = antes + 1;                       // a segunda recompensa falha
    const rp = await redeem.resgatar('jogador-E', c5.codigo);
    falharNo = null;

    check('devolve FALHA_PARCIAL', rp.ok === false && rp.motivo === 'FALHA_PARCIAL', rp.motivo);
    check('a primeira recompensa foi entregue', entregas.length === antes + 1);
    check('diz ao jogador o que já entrou', rp.recompensas.length === 1);

    const resgateE = resgates.find((r) => r.userId === 'jogador-E');
    check('o resgate fica marcado como falho', resgateE.estado === 'falhou');
    check('guarda o índice do que já saiu', JSON.stringify(resgateE.entregues) === '[0]');
    check('guarda o erro para o painel', typeof resgateE.erro === 'string' && resgateE.erro.length > 0);
    check('o uso NÃO é devolvido',
        codigos.find((c) => c.codigo === c5.codigo).usos === 1,
        '<- devolver faria o jogador resgatar de novo e receber em dobro o que deu certo');

    const retry = await redeem.resgatar('jogador-E', c5.codigo);
    check('tentar de novo sozinho é bloqueado',
        retry.ok === false && retry.motivo === 'ENTREGA_PENDENTE', retry.motivo);

    // -----------------------------------------------------------------
    console.log('\n=== Reprocessar entrega o que faltou, e só isso ===');

    const depois = entregas.length;
    const rr = await redeem.reprocessar(c5.codigo, 'jogador-E');
    check('reprocessar conclui', rr.ok === true, rr.motivo || '');
    check('entregou só as 2 que faltavam', entregas.length === depois + 2,
        `(+${entregas.length - depois})`);
    check('o resgate vira concluído',
        resgates.find((r) => r.userId === 'jogador-E').estado === 'concluido');
    check('limpa o erro anterior',
        resgates.find((r) => r.userId === 'jogador-E').erro === null);
    check('reprocessar de novo não entrega nada',
        (await redeem.reprocessar(c5.codigo, 'jogador-E')).motivo === 'JA_CONCLUIDO');

    console.log(falhas === 0
        ? '\n*** TODOS OS TESTES DE CÓDIGO PASSARAM ***'
        : `\n*** ${falhas} FALHA(S) ***`);
    process.exit(falhas ? 1 : 0);
})();
