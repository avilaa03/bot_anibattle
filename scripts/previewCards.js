/**
 * Renderiza cartas de verdade do banco em arquivos PNG locais, para você
 * conferir o design sem precisar ficar dando /roll no Discord.
 *
 * Uso:
 *   npm run preview:cards                    # uma carta de cada raridade
 *   npm run preview:cards -- --nome Kirito   # uma carta específica
 *   npm run preview:cards -- --cada 3        # 3 cartas de cada raridade
 *
 * Os PNGs saem em scripts/preview/. Abra a pasta e olhe as imagens.
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Card = require('../Commands/utils/cardSchema');
const CardBuilder = require('../Commands/utils/cardBuilder');

const RARITIES = ['common', 'rare', 'ultra rare', 'legendary', 'master'];
const OUT_DIR = path.join(__dirname, 'preview');

function parseArgs(argv) {
    const args = { nome: null, cada: 1 };
    for (let i = 2; i < argv.length; i++) {
        const key = argv[i];
        const value = argv[i + 1];
        if (key === '--nome' && value) { args.nome = value; i++; }
        else if (key === '--cada' && value) { args.cada = Math.max(1, parseInt(value, 10) || 1); i++; }
    }
    return args;
}

function slug(text) {
    return String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function renderCard(card, fileName) {
    const inicio = Date.now();
    const builder = new CardBuilder(card);
    const buffer = await builder.build();
    const destino = path.join(OUT_DIR, fileName);
    fs.writeFileSync(destino, buffer);
    const ms = Date.now() - inicio;
    const kb = (buffer.length / 1024).toFixed(0);
    console.log(`  ✓ ${fileName} — ${kb} KB, ${ms}ms`);
    return ms;
}

async function main() {
    const args = parseArgs(process.argv);

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const total = await Card.countDocuments();
    if (total === 0) {
        console.error('Nenhuma carta no banco. Importe primeiro com: npm run seed:cards <arquivo.json>');
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`Catálogo tem ${total} cartas.\n`);

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const tempos = [];

    if (args.nome) {
        const cards = await Card.find({ name: new RegExp(escapeRegex(args.nome), 'i') }).limit(5).lean();
        if (cards.length === 0) {
            console.error(`Nenhuma carta encontrada com o nome "${args.nome}".`);
            await mongoose.disconnect();
            process.exit(1);
        }
        console.log(`Renderizando ${cards.length} carta(s) com nome parecido com "${args.nome}":`);
        for (const card of cards) {
            tempos.push(await renderCard(card, `${slug(card.rarity)}-${slug(card.name)}.png`));
        }
    } else {
        for (const rarity of RARITIES) {
            const cards = await Card.aggregate([
                { $match: { rarity } },
                { $sample: { size: args.cada } }
            ]);

            if (cards.length === 0) {
                console.log(`  (nenhuma carta "${rarity}" no banco — pulando)`);
                continue;
            }

            console.log(`Raridade "${rarity}":`);
            for (const card of cards) {
                tempos.push(await renderCard(card, `${slug(rarity)}-${slug(card.name)}.png`));
            }
        }
    }

    if (tempos.length > 0) {
        const media = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
        console.log(`\n${tempos.length} carta(s) geradas em ${OUT_DIR}`);
        console.log(`Tempo médio por carta: ${media}ms (inclui baixar a imagem do personagem).`);
        if (media > 3000) {
            console.log('⚠️  Acima de 3s por carta o Discord pode dar timeout no /roll sem deferReply. Vale considerar cachear as imagens.');
        }
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro ao gerar preview:', err);
    process.exit(1);
});
