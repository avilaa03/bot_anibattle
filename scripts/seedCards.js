/**
 * Importa cartas em massa para o MongoDB a partir de um arquivo JSON,
 * em vez de cadastrar uma por uma manualmente no Compass/Atlas.
 *
 * Uso:
 *   npm run seed:cards scripts/cards.anilist.json
 *   node scripts/seedCards.js scripts/cards.example.json
 *
 * O arquivo de entrada é uma lista de objetos. Cada objeto PRECISA ter
 * pelo menos: name, series, rarity, characterImage.
 * Os campos abaixo são opcionais — se não vierem, são gerados
 * automaticamente com base na faixa de valores da raridade (ver
 * STAT_RANGES): overall, ATA, LIF, POW.
 * seriesImage e baseImage também são opcionais (o fundo da carta é
 * desenhado por código a partir da cor da raridade — você não precisa
 * hospedar imagem de fundo nenhuma).
 *
 * A importação é idempotente: rodar duas vezes o mesmo arquivo não cria
 * cartas duplicadas, porque a chave usada é name + series.
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Card = require('../Commands/utils/cardSchema');

// Faixas de estatística por raridade — ajuste esses números como quiser,
// eles só definem os valores sorteados quando você NÃO informa overall/
// ATA/LIF/POW manualmente no JSON de entrada.
const STAT_RANGES = {
    common: { overall: [30, 55], ATA: [20, 50], LIF: [60, 100], POW: [20, 50] },
    rare: { overall: [50, 65], ATA: [45, 65], LIF: [90, 130], POW: [45, 65] },
    'ultra rare': { overall: [62, 78], ATA: [60, 80], LIF: [120, 160], POW: [60, 80] },
    legendary: { overall: [75, 90], ATA: [75, 95], LIF: [150, 190], POW: [75, 95] },
    master: { overall: [88, 99], ATA: [90, 99], LIF: [180, 220], POW: [90, 99] }
};

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fillStats(entry, rarity) {
    const tier = STAT_RANGES[rarity] || STAT_RANGES.common;
    return {
        overall: entry.overall ?? randInt(tier.overall[0], tier.overall[1]),
        ATA: entry.ATA ?? randInt(tier.ATA[0], tier.ATA[1]),
        LIF: entry.LIF ?? randInt(tier.LIF[0], tier.LIF[1]),
        POW: entry.POW ?? randInt(tier.POW[0], tier.POW[1])
    };
}

async function main() {
    const inputFile = process.argv[2];
    if (!inputFile) {
        console.error('Uso: node scripts/seedCards.js <caminho-do-arquivo.json>');
        process.exit(1);
    }

    const filePath = path.isAbsolute(inputFile) ? inputFile : path.join(process.cwd(), inputFile);
    if (!fs.existsSync(filePath)) {
        console.error('Arquivo não encontrado:', filePath);
        process.exit(1);
    }

    let entries;
    try {
        entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.error('JSON inválido em', filePath, '-', err.message);
        process.exit(1);
    }

    if (!Array.isArray(entries) || entries.length === 0) {
        console.error('O arquivo precisa conter uma lista (array) de cartas.');
        process.exit(1);
    }

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Conectado ao MongoDB. Processando ${entries.length} cartas de ${filePath}...`);

    const operations = [];
    let invalid = 0;
    const seenInFile = new Set();

    for (const entry of entries) {
        if (!entry.name || !entry.series || !entry.characterImage) {
            console.warn('⚠️  Pulando entrada inválida (faltando name/series/characterImage):', JSON.stringify(entry).slice(0, 120));
            invalid++;
            continue;
        }

        // Evita mandar a mesma carta duas vezes no mesmo lote (o Mongo
        // recusaria operações conflitantes dentro de um único bulkWrite).
        const dedupeKey = `${entry.name}::${entry.series}`.toLowerCase();
        if (seenInFile.has(dedupeKey)) {
            invalid++;
            continue;
        }
        seenInFile.add(dedupeKey);

        const rarity = String(entry.rarity || 'common').toLowerCase();
        if (!STAT_RANGES[rarity]) {
            console.warn(`⚠️  Raridade desconhecida "${entry.rarity}" em "${entry.name}" — usando a faixa de "common" para gerar stats, mas salvando a raridade como digitada.`);
        }

        const stats = fillStats(entry, rarity);

        operations.push({
            updateOne: {
                filter: { name: entry.name, series: entry.series },
                // $setOnInsert: se a carta já existe, nada é sobrescrito —
                // ajustes manuais que você tenha feito no banco sobrevivem
                // a uma reimportação do mesmo arquivo.
                update: {
                    $setOnInsert: {
                        name: entry.name,
                        series: entry.series,
                        seriesImage: entry.seriesImage || '',
                        baseImage: entry.baseImage || '',
                        characterImage: entry.characterImage,
                        rarity,
                        ...stats
                    }
                },
                upsert: true
            }
        });
    }

    if (operations.length === 0) {
        console.error('Nenhuma carta válida para importar.');
        await mongoose.disconnect();
        process.exit(1);
    }

    // Envia em lotes para não estourar o limite de tamanho de operação do Mongo.
    const BATCH_SIZE = 500;
    let created = 0;

    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const batch = operations.slice(i, i + BATCH_SIZE);
        const result = await Card.bulkWrite(batch, { ordered: false });
        created += result.upsertedCount || 0;
        console.log(`  Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${result.upsertedCount || 0} novas cartas.`);
    }

    const skipped = operations.length - created;
    const total = await Card.countDocuments();

    console.log(`\n✓ ${created} cartas criadas. ${skipped} já existiam (não foram alteradas). ${invalid} entradas inválidas/repetidas no arquivo.`);
    console.log(`Total de cartas no catálogo agora: ${total}`);

    const porRaridade = await Card.aggregate([
        { $group: { _id: '$rarity', total: { $sum: 1 } } },
        { $sort: { total: -1 } }
    ]);
    console.log('\nDistribuição no banco:');
    for (const linha of porRaridade) {
        console.log(`  ${String(linha._id).padEnd(11)} ${linha.total}`);
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro ao importar cartas:', err);
    process.exit(1);
});
