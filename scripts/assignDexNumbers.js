/**
 * Atribui o número de Pokédex às cartas que ainda não têm.
 *
 * A numeração passou a existir depois que o catálogo já estava povoado,
 * então as cartas antigas ficaram sem número. Rode este script uma vez
 * para numerar todas.
 *
 * Também é seguro rodar depois de importar cartas novas — o seed já
 * numera sozinho, mas se algo escapar, este script fecha a lacuna.
 *
 * Uso:  npm run migrate:dex
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const Card = require('../Commands/utils/cardSchema');
const { assignMissingDexNumbers, formatarNumero } = require('../Commands/utils/dexNumbers');

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const total = await Card.countDocuments();
    const semNumeroAntes = await Card.countDocuments({ numero: null });

    console.log(`Catálogo: ${total} carta(s)`);
    console.log(`Sem número: ${semNumeroAntes}\n`);

    if (semNumeroAntes === 0) {
        console.log('✅ Todas as cartas já estão numeradas. Nada a fazer.');
        await mongoose.disconnect();
        return;
    }

    const inicio = Date.now();
    const resultado = await assignMissingDexNumbers();
    const ms = Date.now() - inicio;

    console.log(`✅ ${resultado.atribuidos} carta(s) numerada(s) em ${ms}ms`);
    console.log(`   Faixa atribuída: ${formatarNumero(resultado.primeiro, total)} a ${formatarNumero(resultado.ultimo, total)}\n`);

    // Amostra do começo da dex, para conferência visual.
    const amostra = await Card.find({ numero: { $ne: null } })
        .sort({ numero: 1 })
        .limit(10)
        .select('numero name series rarity')
        .lean();

    console.log('Começo da Pokédex:');
    for (const c of amostra) {
        console.log(`  ${formatarNumero(c.numero, total)}  ${c.name.padEnd(24)} ${String(c.series).slice(0, 28).padEnd(28)} ${c.rarity}`);
    }

    // Sanidade: nenhum número repetido.
    const duplicados = await Card.aggregate([
        { $match: { numero: { $ne: null } } },
        { $group: { _id: '$numero', total: { $sum: 1 } } },
        { $match: { total: { $gt: 1 } } },
        { $limit: 5 }
    ]);
    if (duplicados.length > 0) {
        console.log(`\n⚠️  Números duplicados encontrados: ${duplicados.map((d) => d._id).join(', ')}`);
        console.log('   Isso não deveria acontecer. Verifique o índice único em "numero".');
    } else {
        console.log('\n✓ Nenhum número duplicado.');
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro ao numerar cartas:', err);
    process.exit(1);
});
