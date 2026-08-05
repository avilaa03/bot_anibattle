const User = require('./userSchema');
const nivel = require('./nivel');
const bolsa = require('./bolsa');
const caixas = require('./caixas');
const { addBalance } = require('./economy');

/**
 * Ganho de XP e entrega das recompensas de nível.
 *
 * Fica separado do `progresso.js` porque aquele arquivo é o ponto central
 * de contadores, missões e conquistas — e ele já faz três coisas. Aqui é
 * só a quarta, e a que precisa de cuidado próprio com entrega.
 *
 * ## Por que o nível é derivado e a ENTREGA é gravada
 *
 * `xp` é a única fonte: o nível sai dele por `nivel.nivelDoXp()`. Guardar
 * os dois seria pedir para eles discordarem, e aí não há como saber qual
 * está certo.
 *
 * Mas o que já foi PAGO precisa ser gravado, e é o que `nivelEntregue`
 * faz. Sem ele:
 *
 *   - se a entrega falhasse no meio, o jogador nunca receberia; ou
 *   - se fosse recalculado a cada ação, ele receberia de novo para sempre.
 *
 * Com ele, a entrega é idempotente: pagamos do `nivelEntregue + 1` até o
 * nível atual, e só então movemos a marca.
 *
 * ## O XP nunca derruba a ação que o gerou
 *
 * Mesma regra do livro-razão. Se o ganho de XP falhar, o jogador ainda
 * rolou a carta e ganhou a batalha — ele só não vê a barra mexer. O
 * contrário seria um erro de XP impedindo alguém de jogar.
 */

/**
 * Soma XP e entrega o que vencer.
 *
 * @param {string} userId
 * @param {number} quantidade
 * @returns {Promise<{subiu: boolean, nivelAntes: number, nivelDepois: number, entregues: Array}>}
 */
async function ganhar(userId, quantidade) {
    const xp = Math.max(0, Math.floor(Number(quantidade) || 0));
    const vazio = { subiu: false, nivelAntes: 1, nivelDepois: 1, entregues: [] };
    if (!userId || xp === 0) return vazio;

    try {
        // `new: false` devolve o documento ANTES do incremento — é assim
        // que sabemos de onde o jogador saiu sem uma leitura extra, e sem
        // janela entre ler e escrever.
        const antes = await User.findOneAndUpdate(
            { id: userId },
            { $inc: { xp } },
            { new: false, upsert: true, setDefaultsOnInsert: true }
        );

        const xpAntes = Number(antes?.xp) || 0;
        const xpDepois = xpAntes + xp;

        const nivelAntes = nivel.nivelDoXp(xpAntes);
        const nivelDepois = nivel.nivelDoXp(xpDepois);

        if (nivelDepois <= nivelAntes) {
            return { subiu: false, nivelAntes, nivelDepois, entregues: [] };
        }

        const entregues = await entregarAte(userId, nivelDepois);
        return { subiu: entregues.length > 0, nivelAntes, nivelDepois, entregues };
    } catch (err) {
        // Ver o cabeçalho: XP nunca derruba a ação que o gerou.
        console.error('Erro ao ganhar XP (ação não afetada):', err.message);
        return vazio;
    }
}

/**
 * Paga tudo que ainda não foi pago até o nível alvo.
 *
 * A marca só avança DEPOIS da entrega. Se algo falhar no meio, a próxima
 * chamada tenta de novo a partir de onde parou — no pior caso o jogador
 * recebe com atraso, nunca de menos.
 */
async function entregarAte(userId, nivelAlvo) {
    const doc = await User.findOne({ id: userId }).select('nivelEntregue').lean();
    const jaPago = Math.max(1, Number(doc?.nivelEntregue) || 1);

    if (nivelAlvo <= jaPago) return [];

    const entregues = [];
    for (let n = jaPago + 1; n <= nivelAlvo; n++) {
        const recompensa = nivel.recompensaDoNivel(n);
        await pagar(userId, recompensa);
        entregues.push({ nivel: n, recompensa });
    }

    await User.updateOne({ id: userId }, { $set: { nivelEntregue: nivelAlvo } });
    return entregues;
}

/** Credita uma recompensa. Moeda, itens e caixas. */
async function pagar(userId, recompensa) {
    if (recompensa.moedas > 0) {
        await addBalance(userId, recompensa.moedas);
    }

    for (const [chave, quantidade] of Object.entries(recompensa.itens || {})) {
        await bolsa.adicionar(userId, chave, quantidade).catch((err) => {
            console.error(`Erro ao entregar item ${chave}:`, err.message);
        });
    }

    for (const [chave, quantidade] of Object.entries(recompensa.caixas || {})) {
        await bolsa.adicionar(userId, caixas.chaveNaBolsa(chave), quantidade).catch((err) => {
            console.error(`Erro ao entregar caixa ${chave}:`, err.message);
        });
    }
}

/** Descreve uma recompensa em texto, para a mensagem de subida de nível. */
function descrever(recompensa) {
    const partes = [];

    if (recompensa.moedas > 0) {
        partes.push(`🪙 **${recompensa.moedas.toLocaleString('pt-BR')}** moedas`);
    }

    for (const [chave, n] of Object.entries(recompensa.itens || {})) {
        partes.push(`**${n}×** \`${chave}\``);
    }

    for (const [chave, n] of Object.entries(recompensa.caixas || {})) {
        const caixa = caixas.getCaixa(chave);
        partes.push(`${caixa?.emoji ?? '🎁'} **${n}× ${caixa?.nome ?? chave}**`);
    }

    if (recompensa.cargas) {
        partes.push('🎴 **+1 carga de roll** — você passa a acumular rolls não usados');
    }

    return partes;
}

module.exports = { ganhar, entregarAte, pagar, descrever };
