/**
 * Recalcula o valor de todas as cartas já existentes.
 *
 * ## Por que precisa de migração
 *
 * `marketValue` e `valueToSell` ficam GRAVADOS na carta, no momento em que
 * ela entra no inventário (`rollCollect.js`). Trocar a fórmula em
 * `utils/valores.js` só afeta cartas novas — o acervo inteiro continuaria
 * com o preço antigo, e o mercado ficaria com duas tabelas de preço
 * convivendo.
 *
 * ## A recuperação do overall
 *
 * Cartas antigas podem não ter o campo `overall`. Sob a fórmula ANTIGA
 * (`marketValue = overall * 10`), dividir o valor por 10 devolvia o
 * overall correto — e esta é a última vez em que essa conta é válida, por
 * isso ela vive isolada em `valores.overallLegado()`.
 *
 * A ordem importa: recuperamos o overall pela fórmula antiga ANTES de
 * gravar o valor novo. Rodar este script duas vezes é seguro, porque
 * depois da primeira passada todas as cartas têm `overall` explícito e a
 * conta inversa deixa de ser usada.
 *
 * Se nem o overall nem o marketValue existirem, buscamos no catálogo pelo
 * `originalCardId`.
 *
 * ## O que é tocado
 *
 *   users.inventory[]   — as cartas de cada jogador
 *   markets             — anúncios abertos no mercado
 *
 * Trocas em andamento (`trades`) NÃO são tocadas de propósito: elas vivem
 * minutos e são canceladas se o bot reiniciar. Migrar no meio de uma
 * negociação mudaria o valor exibido entre a proposta e a confirmação.
 *
 * Uso:
 *   npm run migrar:valores                 # mostra o que faria (dry-run)
 *   npm run migrar:valores -- --confirmar  # aplica
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);
const User = require('../Commands/utils/userSchema');
const Market = require('../Commands/utils/marketSchema');
const Card = require('../Commands/utils/cardSchema');
const valores = require('../Commands/utils/valores');

const brl = (n) => Number(n || 0).toLocaleString('pt-BR');

/** Catálogo em memória, para recuperar overall/raridade de carta sem dados. */
async function carregarCatalogo() {
    const cartas = await Card.find({}).select('_id rarity overall').lean();
    const mapa = new Map();
    for (const c of cartas) mapa.set(String(c._id), c);
    return mapa;
}

/**
 * Descobre raridade e overall de uma carta, na melhor ordem de confiança.
 * @returns {{ rarity: string, overall: number, origem: string }}
 */
function resolver(carta, catalogo) {
    const doCatalogo = catalogo.get(String(carta.originalCardId || carta.cardId));

    const overallDireto = valores.overallDaCarta(carta);
    if (overallDireto > 0) {
        return {
            rarity: carta.rarity || doCatalogo?.rarity || 'common',
            overall: overallDireto,
            origem: 'campo'
        };
    }

    const legado = valores.overallLegado(carta);
    if (legado > 0) {
        return {
            rarity: carta.rarity || doCatalogo?.rarity || 'common',
            overall: legado,
            origem: 'formula-antiga'
        };
    }

    if (doCatalogo) {
        return {
            rarity: carta.rarity || doCatalogo.rarity || 'common',
            overall: doCatalogo.overall || 0,
            origem: 'catalogo'
        };
    }

    return { rarity: carta.rarity || 'common', overall: 0, origem: 'perdido' };
}

async function migrarInventarios(catalogo, confirmar) {
    const total = await User.countDocuments();
    console.log(`\n▶ Inventários: ${brl(total)} jogador(es).`);

    const resumo = { cartas: 0, alteradas: 0, jogadores: 0, origens: {}, antes: 0, depois: 0 };
    const exemplos = [];

    const cursor = User.find({}).cursor();

    for await (const user of cursor) {
        let mexeu = false;

        for (const carta of user.inventory || []) {
            resumo.cartas++;

            const { rarity, overall, origem } = resolver(carta, catalogo);
            resumo.origens[origem] = (resumo.origens[origem] || 0) + 1;

            const novoMercado = valores.valorDeMercado(rarity, overall);
            const novaVenda = valores.valorDeVenda(rarity, overall);

            resumo.antes += Number(carta.marketValue || 0);
            resumo.depois += novoMercado;

            const precisa = carta.marketValue !== novoMercado
                || carta.valueToSell !== novaVenda
                || valores.overallDaCarta(carta) !== overall
                || carta.rarity !== rarity;

            if (!precisa) continue;

            if (exemplos.length < 8) {
                exemplos.push(
                    `${rarity.padEnd(11)} OVR ${String(overall).padStart(3)} | `
                    + `${String(brl(carta.marketValue || 0)).padStart(9)} -> ${String(brl(novoMercado)).padStart(9)}`
                    + `  (venda ${brl(carta.valueToSell || 0)} -> ${brl(novaVenda)})`
                );
            }

            carta.rarity = rarity;
            carta.overall = overall;
            carta.marketValue = novoMercado;
            carta.valueToSell = novaVenda;

            resumo.alteradas++;
            mexeu = true;
        }

        if (mexeu) {
            resumo.jogadores++;
            if (confirmar) await user.save();
        }
    }

    return { resumo, exemplos };
}

async function migrarMercado(catalogo, confirmar) {
    const anuncios = await Market.find({}).lean();
    console.log(`\n▶ Mercado: ${brl(anuncios.length)} anúncio(s).`);

    let alterados = 0;

    for (const anuncio of anuncios) {
        const { rarity, overall } = resolver(anuncio, catalogo);
        const novoMercado = valores.valorDeMercado(rarity, overall);

        if (anuncio.marketValue === novoMercado && valores.overallDaCarta(anuncio) === overall) continue;

        alterados++;
        if (confirmar) {
            // `listingPrice` NÃO é tocado: é o preço que o vendedor
            // escolheu. Mexer nele seria reprecificar a mercadoria de
            // alguém sem avisar.
            await Market.updateOne(
                { _id: anuncio._id },
                { $set: { marketValue: novoMercado, overall, rarity } }
            );
        }
    }

    return alterados;
}

async function main() {
    const confirmar = process.argv.includes('--confirmar');

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log(confirmar ? '=== MIGRAÇÃO DE VALORES (aplicando) ===' : '=== MIGRAÇÃO DE VALORES (simulação) ===');
    console.log(`Multiplicador global: ${valores.MULTIPLICADOR}x`);

    const catalogo = await carregarCatalogo();
    console.log(`Catálogo carregado: ${brl(catalogo.size)} carta(s).`);

    const { resumo, exemplos } = await migrarInventarios(catalogo, confirmar);
    const anunciosAlterados = await migrarMercado(catalogo, confirmar);

    console.log('\n=== RESUMO ===');
    console.log(`Cartas percorridas:      ${brl(resumo.cartas)}`);
    console.log(`Cartas alteradas:        ${brl(resumo.alteradas)}`);
    console.log(`Jogadores afetados:      ${brl(resumo.jogadores)}`);
    console.log(`Anúncios alterados:      ${brl(anunciosAlterados)}`);
    console.log('\nDe onde veio o overall:');
    for (const [origem, n] of Object.entries(resumo.origens)) {
        console.log(`  ${origem.padEnd(16)} ${brl(n)}`);
    }
    if (resumo.origens.perdido) {
        console.log('\n⚠️  "perdido" = carta sem overall, sem valor e fora do catálogo.');
        console.log('    Elas ficaram com overall 0 e o preço mínimo da raridade.');
    }

    console.log('\nPatrimônio somado em cartas:');
    console.log(`  antes:  ${brl(resumo.antes)}`);
    console.log(`  depois: ${brl(resumo.depois)}`);

    if (exemplos.length > 0) {
        console.log('\nAmostra:');
        for (const linha of exemplos) console.log(`  ${linha}`);
    }

    if (!confirmar) {
        console.log('\n>> Simulação. Nada foi gravado.');
        console.log('>> Para aplicar: npm run migrar:valores -- --confirmar');
    } else {
        console.log('\n✅ Migração aplicada.');
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Erro na migração:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
