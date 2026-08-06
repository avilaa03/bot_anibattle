/**
 * Por que uma carta não funciona em batalha, mercado ou troca.
 *
 * ## O que ele procura
 *
 * Batalha, troca e mercado identificam a cópia por **`card._id`**. Uma
 * carta sem esse campo aparece normalmente no inventário e no `/show`,
 * mas todo botão que tenta usá-la responde "essa carta não está mais no
 * seu inventário" — o sintoma é longe da causa, e é isso que torna o bug
 * difícil de achar.
 *
 * A causa conhecida: o bot grava pelo Mongoose, que gera `_id` para cada
 * item de array de subdocumento automaticamente. O painel do site grava
 * pelo driver nativo, que **não** gera. Por um tempo as cartas dadas pelo
 * painel entraram sem o campo.
 *
 * Isso foi corrigido no site, mas **a correção só vale para entregas
 * novas** — as cartas já gravadas continuam quebradas no banco até alguém
 * rodar `npm run reparar:inventario`.
 *
 * ## Por que este script existe além do reparo
 *
 * `reparar:inventario` conserta o `_id` ausente e só. Este aqui responde
 * "o que exatamente está errado?", incluindo casos que o reparo não
 * cobre: `_id` gravado como STRING em vez de ObjectId, `cardId` ausente
 * (o favCard e o painel dependem dele) e `originalCardId` ausente (sem
 * ele a carta não registra na Pokédex).
 *
 * Só LÊ. Não altera nada.
 *
 * Uso:
 *   npm run diagnosticar:inventario
 *   npm run diagnosticar:inventario -- --id=123456789
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const brl = (n) => Number(n || 0).toLocaleString('pt-BR');

function argumento(nome) {
    const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.split('=')[1] : null;
}

/** Que problemas esta carta tem? */
function diagnosticar(carta) {
    const problemas = [];

    if (carta._id === undefined || carta._id === null) {
        problemas.push('SEM_ID');
    } else if (typeof carta._id === 'string') {
        // Ainda não vimos acontecer, mas se acontecer o sintoma é o mesmo
        // e o reparo atual não pegaria: ele só procura `_id` ausente.
        problemas.push('ID_STRING');
    }

    if (!carta.cardId) problemas.push('SEM_CARDID');
    if (!carta.originalCardId) problemas.push('SEM_ORIGINALCARDID');
    if (carta.overall === undefined || carta.overall === null) problemas.push('SEM_OVERALL');
    if (carta.marketValue === undefined || carta.marketValue === null) problemas.push('SEM_VALOR');

    return problemas;
}

const EXPLICACAO = {
    SEM_ID: 'não funciona em batalha, troca nem mercado — "essa carta não está mais no seu inventário"',
    ID_STRING: '`_id` gravado como texto em vez de ObjectId; o mercado não acha a carta',
    SEM_CARDID: 'não pode ser favorita, e o painel admin não consegue removê-la',
    SEM_ORIGINALCARDID: 'não registra na Pokédex e perde o vínculo com o catálogo',
    SEM_OVERALL: 'aparece com OVR 0 em toda tela',
    SEM_VALOR: 'aparece valendo 0 no inventário e no patrimônio'
};

const REPARAVEL = new Set(['SEM_ID']);

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    // Pelo driver nativo de propósito: pelo Mongoose, ele preencheria os
    // `_id` ausentes em memória e o diagnóstico nunca acharia nada.
    const colecao = mongoose.connection.collection('users');

    const alvo = argumento('id');
    const filtro = alvo ? { id: String(alvo) } : {};

    const jogadores = await colecao
        .find(filtro, { projection: { id: 1, inventory: 1 } })
        .toArray();

    console.log('=== DIAGNÓSTICO DO INVENTÁRIO ===');
    console.log(`${brl(jogadores.length)} jogador(es) examinado(s).\n`);

    const totais = {};
    const afetados = [];
    let totalCartas = 0;
    const exemplos = [];

    for (const jogador of jogadores) {
        const inventario = jogador.inventory || [];
        totalCartas += inventario.length;

        const quebradas = [];
        for (const carta of inventario) {
            const problemas = diagnosticar(carta);
            if (problemas.length === 0) continue;

            quebradas.push({ carta, problemas });
            for (const p of problemas) totais[p] = (totais[p] || 0) + 1;

            if (exemplos.length < 10) {
                exemplos.push(
                    `  ${String(jogador.id).padEnd(20)} ${String(carta.name ?? '?').padEnd(24)}`
                    + ` ${problemas.join(', ')}`
                );
            }
        }

        if (quebradas.length > 0) {
            afetados.push({ id: jogador.id, total: inventario.length, quebradas: quebradas.length });
        }
    }

    console.log(`Cartas percorridas: ${brl(totalCartas)}`);

    if (afetados.length === 0) {
        console.log('\n✅ Nenhuma carta com problema.');
        console.log('\nSe uma carta ainda falha em batalha ou mercado, o problema NÃO é o');
        console.log('inventário — rode o comando e traga o erro exato do log do bot.');
        await mongoose.disconnect();
        return;
    }

    console.log(`Cartas com problema: ${brl(Object.values(totais).reduce((a, b) => a + b, 0))}`);
    console.log(`Jogadores afetados:  ${brl(afetados.length)}\n`);

    console.log('=== O QUE ESTÁ ERRADO ===');
    for (const [problema, n] of Object.entries(totais).sort((a, b) => b[1] - a[1])) {
        console.log(`\n  ${problema} — ${brl(n)} carta(s)`);
        console.log(`    ${EXPLICACAO[problema] ?? '—'}`);
        if (REPARAVEL.has(problema)) {
            console.log('    ✅ CORRIGÍVEL: npm run reparar:inventario -- --confirmar');
        } else {
            console.log('    ⚠️  o reparo atual NÃO cobre este caso.');
        }
    }

    console.log('\n=== JOGADORES MAIS AFETADOS ===');
    for (const a of afetados.sort((x, y) => y.quebradas - x.quebradas).slice(0, 10)) {
        console.log(`  ${String(a.id).padEnd(20)} ${brl(a.quebradas)} de ${brl(a.total)} carta(s)`);
    }

    console.log('\n=== AMOSTRA ===');
    for (const linha of exemplos) console.log(linha);

    if (totais.SEM_ID) {
        console.log('\n─────────────────────────────────────────────────────────────');
        console.log('A causa mais provável: cartas dadas pelo painel ANTES da correção');
        console.log('do `_id`. A correção vale só para entregas novas — o que já estava');
        console.log('gravado continua quebrado até o reparo rodar:');
        console.log('');
        console.log('  npm run reparar:inventario                 # mostra o que faria');
        console.log('  npm run reparar:inventario -- --confirmar  # aplica');
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Erro no diagnóstico:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
