/**
 * Conserta cartas de inventário que ficaram sem `_id`.
 *
 * ## O problema
 *
 * O bot grava pelo Mongoose, que gera um `_id` para cada item de array de
 * subdocumento automaticamente. O painel administrativo do site grava pelo
 * driver nativo do MongoDB, que NÃO gera — e por um tempo as cartas dadas
 * pelo painel entraram no banco sem esse campo.
 *
 * O sintoma não era óbvio: a carta aparecia normalmente no inventário, mas
 * ao escolhê-la numa batalha ou numa troca o bot respondia "essa carta não
 * está mais no seu inventário". Isso porque batalha, troca e mercado
 * identificam a cópia por `card._id`, não por `card.cardId`.
 *
 * A causa foi corrigida no site. Este script repara o que já estava gravado.
 *
 * ## Como funciona
 *
 * Carregar o documento pelo Mongoose já faz ele atribuir `_id` aos itens
 * que não têm; o `save()` grava. Nenhum outro campo é tocado, e rodar duas
 * vezes não faz diferença.
 *
 * Uso:
 *   npm run reparar:inventario                 # mostra o que faria
 *   npm run reparar:inventario -- --confirmar  # aplica
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);
const User = require('../Commands/utils/userSchema');

async function main() {
    const confirmar = process.argv.includes('--confirmar');

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    // A consulta usa o driver por baixo do Mongoose de propósito: se
    // fôssemos pelo Mongoose, ele já teria preenchido os `_id` em memória
    // e o filtro nunca acharia nada.
    const colecao = mongoose.connection.collection('users');
    const afetados = await colecao.find(
        { 'inventory._id': { $exists: false }, 'inventory.0': { $exists: true } },
        { projection: { id: 1, inventory: 1 } }
    ).toArray();

    if (afetados.length === 0) {
        console.log('\n✓ Nenhuma carta sem `_id`. Nada a fazer.');
        await mongoose.disconnect();
        return;
    }

    let totalCartas = 0;
    console.log(`\n${afetados.length} jogador(es) com cartas sem \`_id\`:\n`);

    for (const doc of afetados) {
        const quebradas = (doc.inventory || []).filter((c) => !c._id);
        totalCartas += quebradas.length;
        console.log(`  ${doc.id} — ${quebradas.length} de ${doc.inventory.length} carta(s)`);
        for (const c of quebradas.slice(0, 5)) {
            console.log(`      • ${c.name} (${c.rarity})`);
        }
        if (quebradas.length > 5) console.log(`      ...e mais ${quebradas.length - 5}`);
    }

    console.log(`\nTotal: ${totalCartas} carta(s) inutilizáveis em batalha e troca.`);

    if (!confirmar) {
        console.log('\n👀 Simulação. Para consertar de verdade:');
        console.log('   npm run reparar:inventario -- --confirmar');
        await mongoose.disconnect();
        return;
    }

    let consertados = 0;
    for (const doc of afetados) {
        // Carregar pelo Mongoose faz ele atribuir os `_id` que faltam.
        const user = await User.findOne({ id: doc.id });
        if (!user) continue;

        user.markModified('inventory');
        await user.save();

        // Confere que deu certo antes de contar como resolvido.
        const depois = await colecao.findOne(
            { id: doc.id },
            { projection: { inventory: 1 } }
        );
        const aindaQuebradas = (depois?.inventory || []).filter((c) => !c._id).length;

        if (aindaQuebradas === 0) {
            consertados++;
            console.log(`  ✓ ${doc.id}`);
        } else {
            console.log(`  ✗ ${doc.id} — ainda restam ${aindaQuebradas}`);
        }
    }

    console.log(`\n✓ ${consertados} de ${afetados.length} jogador(es) consertado(s).`);
    console.log('  As cartas voltam a funcionar em batalha, troca e mercado.');

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
});
