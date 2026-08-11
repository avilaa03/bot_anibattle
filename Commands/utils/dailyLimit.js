const User = require('./userSchema');

/**
 * Contadores que zeram quando o dia vira.
 *
 * Usado pelo limite de compra de caixa e pelo roll extra — os dois casos
 * em que moeda vira carta, e onde "quanto você já fez hoje" precisa ser
 * uma verdade que ninguém consegue contornar.
 *
 * ## Por que não deriva do livro-razão
 *
 * Seria elegante contar as transações de hoje e dispensar estado novo. Mas
 * o razão é best-effort de propósito: ele engole o próprio erro para nunca
 * derrubar a operação que descreve. Usá-lo como limite significaria que
 * uma falha de gravação vira compra de graça — e um limite que a falha
 * afrouxa não é limite.
 *
 * ## A escrita é atômica, e é aí que mora o problema
 *
 * O jeito ingênuo é ler o contador, comparar no Node e escrever. Entre a
 * leitura e a escrita cabe outro comando: dois cliques rápidos leem "0 de
 * 1" e os dois compram.
 *
 * Aqui quem decide é o banco, no filtro do próprio update — mesmo desenho
 * do `trySpend` e do `bolsa.consumir`.
 *
 * ## O dia é o do servidor, em UTC
 *
 * Fuso do jogador seria mais justo, mas o bot não sabe o fuso de ninguém —
 * e um dia que vira em horário diferente para cada um é impossível de
 * explicar quando alguém reclamar. UTC é arbitrário e previsível, que é o
 * que importa num limite.
 */

/** 'AAAA-MM-DD' em UTC. */
function chaveDoDia(data = new Date()) {
    return data.toISOString().slice(0, 10);
}

/**
 * Tenta consumir uma unidade do limite.
 *
 * @param {string} userId
 * @param {string} grupo   qual contador ('caixa', 'rollExtra')
 * @param {string} chave   subitem dentro do grupo ('lendaria')
 * @param {number} limite  máximo por dia; null = sem limite
 * @returns {Promise<{ok: boolean, usadoHoje: number, limite: number|null}>}
 */
async function consumir(userId, grupo, chave, limite) {
    if (limite === null || limite === undefined) {
        return { ok: true, usadoHoje: 0, limite: null };
    }

    const hoje = chaveDoDia();
    const campoDia = `limites.${grupo}.dia`;
    const campoContador = `limites.${grupo}.usos.${chave}`;

    // Primeiro o rollover. É idempotente: dois comandos simultâneos num dia
    // novo escrevem o mesmo reset, e nenhum perde nada.
    //
    // Zerar o grupo INTEIRO (e não só esta chave) é de propósito: o dia
    // virou para todos os contadores do grupo ao mesmo tempo.
    await User.updateOne(
        { id: userId, [campoDia]: { $ne: hoje } },
        { $set: { [campoDia]: hoje, [`limites.${grupo}.usos`]: {} } },
        { upsert: true }
    ).catch(() => {});

    // Agora o consumo. O `$lt` no FILTRO é a trava: se o contador já estiver
    // no limite, o documento não casa e nada é escrito.
    const atualizado = await User.findOneAndUpdate(
        {
            id: userId,
            [campoDia]: hoje,
            $or: [
                { [campoContador]: { $exists: false } },
                { [campoContador]: { $lt: limite } }
            ]
        },
        { $inc: { [campoContador]: 1 } },
        { new: true }
    );

    if (!atualizado) {
        return { ok: false, usadoHoje: limite, limite };
    }

    return { ok: true, usadoHoje: lerUso(atualizado, grupo, chave), limite };
}

/** Quantas vezes o jogador já usou hoje. Aceita documento Mongoose ou lean. */
function lerUso(user, grupo, chave) {
    const limites = user?.limites;
    if (!limites) return 0;

    const doGrupo = typeof limites.get === 'function' ? limites.get(grupo) : limites[grupo];
    if (!doGrupo) return 0;

    // Dia diferente = o contador é de ontem e vale zero, mesmo que o
    // rollover ainda não tenha rodado.
    const dia = typeof doGrupo.get === 'function' ? doGrupo.get('dia') : doGrupo.dia;
    if (dia !== chaveDoDia()) return 0;

    const usos = typeof doGrupo.get === 'function' ? doGrupo.get('usos') : doGrupo.usos;
    if (!usos) return 0;

    const valor = typeof usos.get === 'function' ? usos.get(chave) : usos[chave];
    return Math.max(0, Number(valor) || 0);
}

/** Quantos ainda restam hoje. `null` quando não há limite. */
function restante(user, grupo, chave, limite) {
    if (limite === null || limite === undefined) return null;
    return Math.max(0, limite - lerUso(user, grupo, chave));
}

/** Devolve uma unidade — para quando a entrega falha depois do consumo. */
async function devolver(userId, grupo, chave) {
    const campoContador = `limites.${grupo}.usos.${chave}`;
    return User.updateOne(
        { id: userId, [campoContador]: { $gt: 0 } },
        { $inc: { [campoContador]: -1 } }
    ).catch(() => null);
}

module.exports = { chaveDoDia, consumir, lerUso, restante, devolver };
