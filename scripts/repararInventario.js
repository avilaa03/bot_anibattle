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

    // ⚠️ `$elemMatch`, e não `'inventory._id': { $exists: false }`.
    //
    // Este script ficou meses dizendo "nenhuma carta sem `_id`" enquanto
    // havia oito, e o motivo é uma sutileza do Mongo que parece bug do
    // banco mas é semântica documentada:
    //
    //   'inventory._id': { $exists: true }   casa se ALGUM elemento tem
    //   'inventory._id': { $exists: false }  casa se NENHUM elemento tem
    //
    // Ou seja: a consulta antiga só encontrava jogadores cujo inventário
    // INTEIRO estava quebrado. Quem tinha 3 cartas ruins entre 21 boas
    // passava batido — as 18 boas faziam o caminho "existir", e a
    // negação dava falso.
    //
    // E o pior é o silêncio: o script terminava com "✓ Nada a fazer",
    // que é indistinguível de estar tudo certo.
    //
    // `$elemMatch` pergunta por ELEMENTO, que é o que sempre se quis.
    const afetados = await colecao.find(
        { inventory: { $elemMatch: { _id: { $exists: false } } } },
        { projection: { id: 1, inventory: 1 } }
    ).toArray();

    if (afetados.length === 0) {
        // Conferência independente da consulta acima.
        //
        // A versão anterior deste script dizia "nada a fazer" com oito
        // cartas quebradas no banco, porque o filtro estava errado — e
        // "nada a fazer" é indistinguível de "está tudo certo".
        //
        // Esta contagem percorre os documentos em JavaScript, sem depender
        // da semântica do filtro. Se ela discordar, o problema é a consulta
        // e não o banco.
        const todos = await colecao.find({}, { projection: { inventory: 1 } }).toArray();
        const quebradas = todos.reduce(
            (total, doc) => total + (doc.inventory || []).filter((c) => !c._id).length,
            0
        );

        if (quebradas > 0) {
            console.log(`\n🚨 A consulta não achou nada, mas existem ${quebradas} carta(s) sem \`_id\`.`);
            console.log('   Isso é bug NESTE script, não no banco. Rode:');
            console.log('   npm run diagnosticar:inventario');
            process.exitCode = 1;
        } else {
            console.log('\n✓ Nenhuma carta sem `_id`. Nada a fazer.');
        }

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
