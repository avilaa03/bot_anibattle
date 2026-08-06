/**
 * Dá cartas para um jogador (ou tira).
 *
 * Serve para testar, compensar um jogador por um bug, premiar em evento,
 * ou desfazer um erro seu.
 *
 * A carta entregue é uma cópia idêntica à que o /roll geraria — mesmos
 * campos, mesmo cálculo de valor de mercado — e também entra na Pokédex,
 * exatamente como se o jogador tivesse rolado.
 *
 * Uso:
 *   npm run cards:grant -- --user <id> --carta "Kirito"
 *   npm run cards:grant -- --user <id> --raridade master --quantidade 3
 *   npm run cards:grant -- --user <id> --serie "Naruto" --quantidade 5
 *   npm run cards:grant -- --user <id> --id 673359c5a5aca0fd5877e974
 *   npm run cards:grant -- --user <id> --carta "Kirito" --remover
 *
 * Opções extras:
 *   --sem-pokedex   entrega a carta sem marcar como descoberta
 *   --confirmar     necessário acima de 25 cartas de uma vez
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const User = require('../Commands/utils/userSchema');
const Card = require('../Commands/utils/cardSchema');
const { registerDiscovery } = require('../Commands/utils/discovery');
const valores = require('../Commands/utils/valores');

const RARIDADES = ['common', 'rare', 'ultra rare', 'legendary', 'master'];
const LIMITE_SEM_CONFIRMAR = 25;

function parseArgs(argv) {
    const args = {
        user: null, carta: null, raridade: null, serie: null, id: null,
        quantidade: 1, remover: false, semPokedex: false, confirmar: false
    };
    for (let i = 2; i < argv.length; i++) {
        const chave = argv[i];
        const valor = argv[i + 1];
        if (chave === '--user' && valor) { args.user = valor; i++; }
        else if (chave === '--carta' && valor) { args.carta = valor; i++; }
        else if (chave === '--raridade' && valor) { args.raridade = valor.toLowerCase(); i++; }
        else if (chave === '--serie' && valor) { args.serie = valor; i++; }
        else if (chave === '--id' && valor) { args.id = valor; i++; }
        else if (chave === '--quantidade' && valor) { args.quantidade = Math.max(1, parseInt(valor, 10) || 1); i++; }
        else if (chave === '--remover') { args.remover = true; }
        else if (chave === '--sem-pokedex') { args.semPokedex = true; }
        else if (chave === '--confirmar') { args.confirmar = true; }
    }
    return args;
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Monta a cópia da carta para o inventário.
 *
 * O preço sai de `utils/valores.js`, a mesma fonte que o /roll usa. Antes
 * daqui saía `overall * 10`, a fórmula anterior à raridade entrar na
 * conta: uma Mestra dada por evento entrava no inventário valendo 950 em
 * vez de 190.500, e o valor fica GRAVADO na cópia — cada uso do script
 * sujava o acervo que a migração acabara de arrumar.
 */
function montarCopia(card) {
    const { marketValue, valueToSell } = valores.valoresDaCarta(card);
    return {
        cardId: new mongoose.Types.ObjectId(),
        originalCardId: card._id,
        name: card.name,
        series: card.series,
        seriesImage: card.seriesImage,
        baseImage: card.baseImage,
        characterImage: card.characterImage,
        rarity: card.rarity,
        overall: card.overall,
        ATA: card.ATA,
        LIF: card.LIF,
        POW: card.POW,
        obtainedAt: new Date(),
        marketValue,
        valueToSell,
        // Congela a negociabilidade, igual ao rollCollect.js e ao painel.
        // Sem isto, carta vinculada entregue por script sairia negociável.
        comercializavel: card.comercializavel !== false
    };
}

/** Encontra as cartas do catálogo conforme os filtros informados. */
async function selecionarCartas(args) {
    if (args.id) {
        if (!mongoose.Types.ObjectId.isValid(args.id)) {
            throw new Error(`"${args.id}" não é um ObjectId válido.`);
        }
        const card = await Card.findById(args.id).lean();
        if (!card) throw new Error(`Nenhuma carta com o id ${args.id}.`);
        return Array(args.quantidade).fill(card);
    }

    const filtro = {};
    if (args.carta) filtro.name = new RegExp(escapeRegex(args.carta), 'i');
    if (args.serie) filtro.series = new RegExp(escapeRegex(args.serie), 'i');
    if (args.raridade) filtro.rarity = args.raridade;

    if (Object.keys(filtro).length === 0) {
        throw new Error('Informe pelo menos um filtro: --carta, --raridade, --serie ou --id.');
    }

    // Nome exato tem prioridade: se o jogador pediu "Kirito", entregamos
    // Kirito, não uma carta aleatória que contenha "Kirito" no nome.
    if (args.carta) {
        const candidatas = await Card.find(filtro).lean();
        if (candidatas.length === 0) throw new Error('Nenhuma carta encontrada com esses filtros.');

        const exata = candidatas.find((c) => c.name.toLowerCase() === args.carta.toLowerCase());
        if (exata) return Array(args.quantidade).fill(exata);

        if (candidatas.length > 1) {
            console.log(`\n⚠️  ${candidatas.length} cartas correspondem a "${args.carta}":`);
            for (const c of candidatas.slice(0, 10)) {
                console.log(`   • ${c.name} — ${c.series} (${c.rarity})`);
            }
            if (candidatas.length > 10) console.log(`   ...e mais ${candidatas.length - 10}`);
            console.log('   Use --id para escolher exatamente uma, ou escreva o nome completo.\n');
        }
        return Array(args.quantidade).fill(candidatas[0]);
    }

    // Sem nome: sorteia do conjunto filtrado, como faria um /roll.
    const sorteadas = await Card.aggregate([
        { $match: filtro },
        { $sample: { size: args.quantidade } }
    ]);
    if (sorteadas.length === 0) throw new Error('Nenhuma carta encontrada com esses filtros.');

    // $sample não repete: se pediram mais do que existe, completamos ciclando.
    const resultado = [];
    for (let i = 0; i < args.quantidade; i++) {
        resultado.push(sorteadas[i % sorteadas.length]);
    }
    return resultado;
}

async function remover(args) {
    const user = await User.findOne({ id: args.user });
    if (!user) throw new Error(`Usuário ${args.user} não encontrado.`);

    const antes = user.inventory.length;
    const alvo = (args.carta || '').toLowerCase();

    let removidas = 0;
    const restante = [];
    for (const card of user.inventory) {
        const casaNome = !args.carta || card.name.toLowerCase().includes(alvo);
        const casaRaridade = !args.raridade || String(card.rarity).toLowerCase() === args.raridade;
        const casaSerie = !args.serie || String(card.series || '').toLowerCase().includes(args.serie.toLowerCase());
        const casaId = !args.id || String(card.originalCardId) === args.id;

        if (casaNome && casaRaridade && casaSerie && casaId && removidas < args.quantidade) {
            removidas++;
            continue;
        }
        restante.push(card);
    }

    if (removidas === 0) {
        console.log('Nenhuma carta do inventário corresponde a esses filtros.');
        return;
    }

    user.inventory = restante;
    await user.save();

    console.log(`\n✓ ${removidas} carta(s) removida(s). Inventário: ${antes} → ${user.inventory.length}`);
    console.log('  (A Pokédex NÃO foi alterada — descoberta é permanente, como no jogo.)');
}

async function main() {
    const args = parseArgs(process.argv);

    if (!args.user) {
        console.error('Informe o id do Discord: --user 123456789012345678');
        console.error('(Discord > Configurações > Avançado > Modo desenvolvedor, depois botão direito no usuário > Copiar ID)');
        process.exit(1);
    }
    if (args.raridade && !RARIDADES.includes(args.raridade)) {
        console.error(`Raridade inválida. Use uma de: ${RARIDADES.join(', ')}`);
        process.exit(1);
    }
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    // Valida os argumentos antes de conectar, para erro de digitação não
    // custar o timeout inteiro da conexão.
    if (!args.carta && !args.raridade && !args.serie && !args.id) {
        console.error('Informe pelo menos um filtro: --carta, --raridade, --serie ou --id.');
        process.exit(1);
    }
    if (args.id && !mongoose.Types.ObjectId.isValid(args.id)) {
        console.error(`"${args.id}" não é um ObjectId válido.`);
        process.exit(1);
    }
    if (args.quantidade > LIMITE_SEM_CONFIRMAR && !args.confirmar && !args.remover) {
        console.error(`Você pediu ${args.quantidade} cartas. Acima de ${LIMITE_SEM_CONFIRMAR}, adicione --confirmar.`);
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    try {
        if (args.remover) {
            await remover(args);
            await mongoose.disconnect();
            return;
        }

        const cartas = await selecionarCartas(args);

        const copias = cartas.map(montarCopia);
        const resultado = await User.findOneAndUpdate(
            { id: args.user },
            { $push: { inventory: { $each: copias } } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // Se o usuário ainda não tinha carta favorita, define a primeira —
        // mesmo comportamento do /roll.
        if (!resultado.favCard && copias.length > 0) {
            resultado.favCard = copias[0].cardId;
            await resultado.save();
        }

        console.log(`\n✓ ${copias.length} carta(s) entregue(s) para ${args.user}:`);
        const contagem = {};
        for (const c of copias) {
            const chave = `${c.name} (${c.rarity})`;
            contagem[chave] = (contagem[chave] || 0) + 1;
        }
        for (const [nome, qtd] of Object.entries(contagem)) {
            console.log(`   ${qtd}x ${nome}`);
        }

        if (!args.semPokedex) {
            let inéditas = 0;
            // Set para não chamar o banco duas vezes pela mesma carta.
            for (const id of new Set(cartas.map((c) => String(c._id)))) {
                if (await registerDiscovery(args.user, new mongoose.Types.ObjectId(id))) inéditas++;
            }
            console.log(`\n📖 Pokédex: ${inéditas} descoberta(s) inédita(s) registrada(s).`);
        } else {
            console.log('\n📖 Pokédex não alterada (--sem-pokedex).');
        }

        console.log(`\nInventário do jogador agora: ${resultado.inventory.length} carta(s).`);
    } catch (err) {
        console.error(`\n❌ ${err.message}`);
        await mongoose.disconnect();
        process.exit(1);
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
});
