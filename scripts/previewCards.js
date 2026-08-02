/**
 * Renderiza cartas reais do banco em arquivos locais, para você conferir
 * o design sem precisar ficar dando /roll no Discord.
 *
 * Uso:
 *   npm run preview:cards                       # uma carta de cada raridade (PNG)
 *   npm run preview:cards -- --nome Kirito      # uma carta específica
 *   npm run preview:cards -- --cada 3           # 3 cartas de cada raridade
 *   npm run preview:cards -- --molduras         # uma carta com CADA moldura, incl. os GIFs
 *
 * Os arquivos saem em scripts/preview/. O modo --molduras é o importante
 * para decidir se as cartas animadas são viáveis: ele mostra o peso e o
 * tempo de geração de cada uma.
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Card = require('../Commands/utils/cardSchema');
const CardBuilder = require('../Commands/utils/cardBuilder');
const { buildAnimatedCard, ehAnimada, FRAMES, GIF_W, GIF_H } = require('../Commands/utils/cardAnimator');
const { MOLDURAS } = require('../Commands/utils/vip');

const RARITIES = ['common', 'rare', 'ultra rare', 'legendary', 'master'];
const OUT_DIR = path.join(__dirname, 'preview');

// Limite prático do Discord para anexo em conta gratuita.
const LIMITE_DISCORD_MB = 10;

function parseArgs(argv) {
    const args = { nome: null, cada: 1, molduras: false };
    for (let i = 2; i < argv.length; i++) {
        const key = argv[i];
        const value = argv[i + 1];
        if (key === '--nome' && value) { args.nome = value; i++; }
        else if (key === '--cada' && value) { args.cada = Math.max(1, parseInt(value, 10) || 1); i++; }
        else if (key === '--molduras') { args.molduras = true; }
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

function formatarTamanho(bytes) {
    const kb = bytes / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(0)} KB`;
}

async function renderStatic(card, moldura, fileName) {
    const inicio = Date.now();
    const buffer = await new CardBuilder(card, { moldura }).build();
    fs.writeFileSync(path.join(OUT_DIR, fileName), buffer);
    return { ms: Date.now() - inicio, bytes: buffer.length, fileName };
}

async function renderAnimated(card, moldura, fileName) {
    const inicio = Date.now();
    const buffer = await buildAnimatedCard(card, moldura);
    fs.writeFileSync(path.join(OUT_DIR, fileName), buffer);
    return { ms: Date.now() - inicio, bytes: buffer.length, fileName };
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

    // ---- Modo molduras: uma carta com cada moldura, medindo tudo ----
    if (args.molduras) {
        const amostra = await Card.aggregate([
            { $match: { rarity: { $in: ['legendary', 'master', 'ultra rare'] } } },
            { $sample: { size: 1 } }
        ]);
        const escolhida = amostra[0] || (await Card.findOne().lean());

        console.log(`Renderizando "${escolhida.name}" com cada moldura.`);
        console.log(`GIF: ${GIF_W}x${GIF_H}, ${FRAMES} quadros.\n`);

        const resultados = [];
        for (const key of Object.keys(MOLDURAS)) {
            const animada = ehAnimada(key);
            const nomeArquivo = `moldura-${slug(key)}.${animada ? 'gif' : 'png'}`;
            try {
                const r = animada
                    ? await renderAnimated(escolhida, key, nomeArquivo)
                    : await renderStatic(escolhida, key, nomeArquivo);
                resultados.push({ ...r, moldura: key, animada });
                const alerta = r.bytes > LIMITE_DISCORD_MB * 1024 * 1024 ? '  ⚠️ ACIMA DO LIMITE DO DISCORD' : '';
                console.log(`  ${animada ? '🎞️' : '🖼️ '} ${key.padEnd(13)} ${formatarTamanho(r.bytes).padStart(9)}  ${String(r.ms).padStart(5)}ms${alerta}`);
            } catch (err) {
                if (err.code === 'MODULE_NOT_FOUND') {
                    console.log(`  ⚠️  ${key.padEnd(13)} pulada — falta a dependência. Rode: npm install gif-encoder-2`);
                } else {
                    console.log(`  ❌ ${key.padEnd(13)} erro: ${err.message}`);
                }
            }
        }

        const animadas = resultados.filter((r) => r.animada);
        if (animadas.length > 0) {
            const maiorPeso = Math.max(...animadas.map((r) => r.bytes));
            const maiorTempo = Math.max(...animadas.map((r) => r.ms));
            console.log(`\nAnimadas — maior arquivo: ${formatarTamanho(maiorPeso)} | maior tempo: ${maiorTempo}ms`);

            if (maiorPeso > 8 * 1024 * 1024) {
                console.log('⚠️  Arquivo muito pesado. Reduza CARD_GIF_WIDTH ou CARD_GIF_FRAMES no .env.');
            } else if (maiorPeso > 3 * 1024 * 1024) {
                console.log('⚠️  Peso alto: vai demorar para carregar no celular. Considere reduzir CARD_GIF_FRAMES.');
            } else {
                console.log('✅ Peso saudável para enviar no Discord.');
            }

            if (maiorTempo > 6000) {
                console.log('⚠️  Geração lenta. O bot cai para PNG após CARD_GIF_TIMEOUT_MS (padrão 8s).');
            } else if (maiorTempo > 2500) {
                console.log('⚠️  Geração perceptível, mas dentro do aceitável (o /roll usa deferReply).');
            } else {
                console.log('✅ Tempo de geração confortável.');
            }
        }

        console.log(`\nArquivos em ${OUT_DIR}`);
        await mongoose.disconnect();
        return;
    }

    // ---- Modo padrão: uma carta por raridade, sem moldura ----
    const tempos = [];

    if (args.nome) {
        const cards = await Card.find({ name: new RegExp(escapeRegex(args.nome), 'i') }).limit(5).lean();
        if (cards.length === 0) {
            console.error(`Nenhuma carta encontrada com o nome "${args.nome}".`);
            await mongoose.disconnect();
            process.exit(1);
        }
        console.log(`Renderizando ${cards.length} carta(s):`);
        for (const card of cards) {
            const r = await renderStatic(card, 'nenhuma', `${slug(card.rarity)}-${slug(card.name)}.png`);
            console.log(`  ✓ ${r.fileName} — ${formatarTamanho(r.bytes)}, ${r.ms}ms`);
            tempos.push(r.ms);
        }
    } else {
        for (const rarity of RARITIES) {
            const cards = await Card.aggregate([{ $match: { rarity } }, { $sample: { size: args.cada } }]);
            if (cards.length === 0) {
                console.log(`  (nenhuma carta "${rarity}" no banco — pulando)`);
                continue;
            }
            console.log(`Raridade "${rarity}":`);
            for (const card of cards) {
                const r = await renderStatic(card, 'nenhuma', `${slug(rarity)}-${slug(card.name)}.png`);
                console.log(`  ✓ ${r.fileName} — ${formatarTamanho(r.bytes)}, ${r.ms}ms`);
                tempos.push(r.ms);
            }
        }
    }

    if (tempos.length > 0) {
        const media = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
        console.log(`\n${tempos.length} carta(s) geradas em ${OUT_DIR}`);
        console.log(`Tempo médio: ${media}ms (inclui baixar a imagem do personagem).`);
        console.log('\nDica: rode com --molduras para ver as cartas animadas e o peso de cada uma.');
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro ao gerar preview:', err);
    process.exit(1);
});
