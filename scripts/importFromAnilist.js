/**
 * Gera um manifesto de cartas a partir da API pública do AniList.
 *
 * A ideia: em vez de você editar imagem por imagem e subir no Imgur, este
 * script busca os personagens mais populares do AniList, já pega a URL da
 * imagem oficial (hospedada por eles, não precisa hospedar nada) e decide a
 * raridade automaticamente pela popularidade do personagem — o personagem
 * mais favoritado do site vira "master", o menos favoritado vira "common".
 * É o mesmo princípio que o Mudae usa: quem é mais famoso vale mais.
 *
 * Uso:
 *   node scripts/importFromAnilist.js --pages 10 --out scripts/cards.anilist.json
 *
 * Opções:
 *   --pages N     Quantas páginas de 50 personagens buscar (padrão: 10 = 500 cartas)
 *   --out ARQUIVO Caminho do JSON de saída (padrão: scripts/cards.anilist.json)
 *   --serie NOME  Busca só personagens de um anime específico (ex: --serie "Naruto")
 *
 * Depois de gerar o arquivo, revise/edite à vontade e importe com:
 *   npm run seed:cards scripts/cards.anilist.json
 *
 * O passo de revisão é de propósito: assim você tira personagens que não
 * quer, ajusta raridades e corrige nomes antes de qualquer coisa entrar no
 * banco de dados.
 */

const fs = require('fs');
const path = require('path');

const ANILIST_URL = 'https://graphql.anilist.co';

// Distribuição das raridades: fatia do topo do ranking que cai em cada uma.
// Somando dá 1. Ajuste se quiser mais/menos cartas raras no catálogo.
const RARITY_SPLIT = [
    { rarity: 'master', share: 0.02 },
    { rarity: 'legendary', share: 0.06 },
    { rarity: 'ultra rare', share: 0.15 },
    { rarity: 'rare', share: 0.27 },
    { rarity: 'common', share: 0.50 }
];

// Faixas de atributo por raridade (mesma tabela do seedCards.js).
const STAT_RANGES = {
    common: { overall: [30, 55], ATA: [20, 50], LIF: [60, 100], POW: [20, 50] },
    rare: { overall: [50, 65], ATA: [45, 65], LIF: [90, 130], POW: [45, 65] },
    'ultra rare': { overall: [62, 78], ATA: [60, 80], LIF: [120, 160], POW: [60, 80] },
    legendary: { overall: [75, 90], ATA: [75, 95], LIF: [150, 190], POW: [75, 95] },
    master: { overall: [88, 99], ATA: [90, 99], LIF: [180, 220], POW: [90, 99] }
};

const QUERY = `
query ($page: Int, $search: String) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    characters(sort: FAVOURITES_DESC, search: $search) {
      name { full }
      image { large }
      favourites
      media(perPage: 1, sort: POPULARITY_DESC) {
        nodes { title { romaji english } isAdult }
      }
    }
  }
}`;

function parseArgs(argv) {
    const args = { pages: 10, out: 'scripts/cards.anilist.json', serie: null };
    for (let i = 2; i < argv.length; i++) {
        const key = argv[i];
        const value = argv[i + 1];
        if (key === '--pages' && value) { args.pages = Math.max(1, parseInt(value, 10) || 1); i++; }
        else if (key === '--out' && value) { args.out = value; i++; }
        else if (key === '--serie' && value) { args.serie = value; i++; }
    }
    return args;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Interpola o atributo dentro da faixa da raridade conforme a posição
 * do personagem dentro daquela faixa, com um pouco de variação aleatória
 * para duas cartas da mesma raridade não saírem idênticas. */
function statFor(range, positionInTier) {
    const [min, max] = range;
    const base = min + (max - min) * positionInTier;
    const jitter = (max - min) * 0.12;
    const value = base + (Math.random() * 2 - 1) * jitter;
    return Math.round(Math.max(min, Math.min(max, value)));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(page, search) {
    const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { page, search } })
    });

    if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') || 60);
        console.log(`  Limite de requisições atingido. Aguardando ${retryAfter}s...`);
        await sleep((retryAfter + 1) * 1000);
        return fetchPage(page, search);
    }

    if (!res.ok) {
        throw new Error(`AniList respondeu ${res.status}: ${await res.text()}`);
    }

    const body = await res.json();
    if (body.errors) {
        throw new Error(`AniList retornou erro: ${JSON.stringify(body.errors)}`);
    }
    return body.data.Page;
}

async function main() {
    const args = parseArgs(process.argv);

    if (typeof fetch !== 'function') {
        console.error('Este script precisa de Node 18 ou superior (usa fetch nativo).');
        process.exit(1);
    }

    console.log(`Buscando ${args.pages} página(s) de personagens no AniList${args.serie ? ` (filtro: "${args.serie}")` : ''}...`);

    const collected = [];
    const seen = new Set();

    for (let page = 1; page <= args.pages; page++) {
        const data = await fetchPage(page, args.serie);
        const characters = data.characters || [];

        for (const ch of characters) {
            const name = ch.name?.full?.trim();
            const image = ch.image?.large;
            const media = ch.media?.nodes?.[0];
            const series = media?.title?.english || media?.title?.romaji;

            if (!name || !image || !series) continue;
            if (media?.isAdult) continue; // pula obras adultas
            if (image.includes('default.jpg')) continue; // placeholder do AniList

            const key = `${name}::${series}`.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            collected.push({ name, series, characterImage: image, favourites: ch.favourites || 0 });
        }

        console.log(`  Página ${page}: ${collected.length} personagens acumulados.`);

        if (!data.pageInfo?.hasNextPage) {
            console.log('  Fim dos resultados.');
            break;
        }
        await sleep(800); // respeita o limite de ~90 req/min do AniList
    }

    if (collected.length === 0) {
        console.error('Nenhum personagem encontrado. Tente outro filtro.');
        process.exit(1);
    }

    // Já vem ordenado por favoritos, mas garantimos aqui.
    collected.sort((a, b) => b.favourites - a.favourites);

    // Atribui raridade por posição no ranking.
    const total = collected.length;
    const boundaries = [];
    let acc = 0;
    for (const tier of RARITY_SPLIT) {
        acc += tier.share;
        boundaries.push({ rarity: tier.rarity, limit: Math.round(total * acc) });
    }

    const cards = collected.map((ch, index) => {
        const tier = boundaries.find((b) => index < b.limit) || boundaries[boundaries.length - 1];
        const rarity = tier.rarity;
        const range = STAT_RANGES[rarity];

        // Posição relativa dentro da própria faixa (0 = topo da faixa).
        const tierIndex = boundaries.indexOf(tier);
        const tierStart = tierIndex === 0 ? 0 : boundaries[tierIndex - 1].limit;
        const tierSize = Math.max(1, tier.limit - tierStart);
        const positionInTier = 1 - (index - tierStart) / tierSize;

        return {
            name: ch.name,
            series: ch.series,
            rarity,
            characterImage: ch.characterImage,
            overall: statFor(range.overall, positionInTier),
            ATA: statFor(range.ATA, positionInTier),
            LIF: statFor(range.LIF, positionInTier),
            POW: statFor(range.POW, positionInTier)
        };
    });

    const outPath = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(cards, null, 2), 'utf8');

    const counts = cards.reduce((acc2, c) => {
        acc2[c.rarity] = (acc2[c.rarity] || 0) + 1;
        return acc2;
    }, {});

    console.log(`\n✓ ${cards.length} cartas escritas em ${outPath}`);
    console.log('Distribuição por raridade:');
    for (const tier of RARITY_SPLIT) {
        console.log(`  ${tier.rarity.padEnd(11)} ${counts[tier.rarity] || 0}`);
    }
    console.log(`\nRevise o arquivo e depois importe com:\n  npm run seed:cards ${args.out}`);
}

main().catch((err) => {
    console.error('Erro ao importar do AniList:', err.message);
    process.exit(1);
});
