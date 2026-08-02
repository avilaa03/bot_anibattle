/**
 * Marca cartas como descobertas na Pokédex, SEM entregar a carta.
 *
 * A diferença para o cards:grant é essa: aqui o jogador passa a ver a
 * carta na `/pokedex` e conta no progresso dele, mas não ganha a carta no
 * inventário e não pode usá-la em batalha nem vender.
 *
 * Útil para: corrigir uma Pokédex que ficou desatualizada, premiar
 * participação em evento sem inflar a economia, ou testar as telas de
 * progresso e o ranking de colecionadores.
 *
 * Uso:
 *   npm run pokedex:grant -- --user <id> --carta "Kirito"
 *   npm run pokedex:grant -- --user <id> --raridade master
 *   npm run pokedex:grant -- --user <id> --serie "Naruto"
 *   npm run pokedex:grant -- --user <id> --tudo --confirmar
 *   npm run pokedex:grant -- --user <id> --limpar --confirmar
 *
 * Sem --confirmar, as operações em massa (--tudo e --limpar) apenas
 * mostram o que fariam.
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const User = require('../Commands/utils/userSchema');
const Card = require('../Commands/utils/cardSchema');
const { getProgress } = require('../Commands/utils/discovery');

const RARIDADES = ['common', 'rare', 'ultra rare', 'legendary', 'master'];

function parseArgs(argv) {
    const args = {
        user: null, carta: null, raridade: null, serie: null, id: null,
        tudo: false, limpar: false, confirmar: false
    };
    for (let i = 2; i < argv.length; i++) {
        const chave = argv[i];
        const valor = argv[i + 1];
        if (chave === '--user' && valor) { args.user = valor; i++; }
        else if (chave === '--carta' && valor) { args.carta = valor; i++; }
        else if (chave === '--raridade' && valor) { args.raridade = valor.toLowerCase(); i++; }
        else if (chave === '--serie' && valor) { args.serie = valor; i++; }
        else if (chave === '--id' && valor) { args.id = valor; i++; }
        else if (chave === '--tudo') { args.tudo = true; }
        else if (chave === '--limpar') { args.limpar = true; }
        else if (chave === '--confirmar') { args.confirmar = true; }
    }
    return args;
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function barra(atual, total, tamanho = 20) {
    const proporcao = total > 0 ? atual / total : 0;
    const cheio = Math.round(proporcao * tamanho);
    return `[${'█'.repeat(cheio)}${'░'.repeat(tamanho - cheio)}] ${(proporcao * 100).toFixed(1)}%`;
}

async function mostrarProgresso(userId, titulo) {
    const p = await getProgress(userId);
    console.log(`${titulo}: ${p.descobertas} / ${p.total}  ${barra(p.descobertas, p.total)}`);
    return p;
}

async function limpar(args) {
    const user = await User.findOne({ id: args.user }).select('discovered').lean();
    if (!user) {
        console.error(`Usuário ${args.user} não encontrado.`);
        return;
    }
    const quantas = user.discovered?.length || 0;

    if (quantas === 0) {
        console.log('A Pokédex desse jogador já está vazia.');
        return;
    }

    if (!args.confirmar) {
        console.log(`\n👀 Simulação: ${quantas} descoberta(s) seriam APAGADAS.`);
        console.log('   Para executar de verdade, adicione --confirmar');
        return;
    }

    await User.updateOne({ id: args.user }, { $set: { discovered: [] } });
    console.log(`\n✓ Pokédex zerada: ${quantas} descoberta(s) removida(s).`);
}

async function main() {
    const args = parseArgs(process.argv);

    if (!args.user) {
        console.error('Informe o id do Discord: --user 123456789012345678');
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

    // ---- Monta e valida o filtro ANTES de conectar ----
    // Assim um erro de argumento falha na hora, em vez de esperar o
    // timeout da conexão para só então reclamar.
    const filtro = {};
    if (args.id) {
        if (!mongoose.Types.ObjectId.isValid(args.id)) {
            console.error(`"${args.id}" não é um ObjectId válido.`);
            process.exit(1);
        }
        filtro._id = new mongoose.Types.ObjectId(args.id);
    }
    if (args.carta) filtro.name = new RegExp(escapeRegex(args.carta), 'i');
    if (args.serie) filtro.series = new RegExp(escapeRegex(args.serie), 'i');
    if (args.raridade) filtro.rarity = args.raridade;

    if (Object.keys(filtro).length === 0 && !args.tudo && !args.limpar) {
        console.error('Informe um filtro (--carta, --raridade, --serie, --id) ou use --tudo para a Pokédex inteira.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    if (args.limpar) {
        await limpar(args);
        await mongoose.disconnect();
        return;
    }

    const cartas = await Card.find(filtro).select('_id name series rarity').lean();
    if (cartas.length === 0) {
        console.error('Nenhuma carta encontrada com esses filtros.');
        await mongoose.disconnect();
        process.exit(1);
    }

    // ---- Descobre o que ainda falta ----
    const user = await User.findOne({ id: args.user }).select('discovered').lean();
    const jaTem = new Set((user?.discovered || []).map((d) => String(d.cardId)));
    const faltando = cartas.filter((c) => !jaTem.has(String(c._id)));

    console.log(`\nJogador: ${args.user}`);
    await mostrarProgresso(args.user, 'Pokédex antes');
    console.log(`\nCartas no filtro: ${cartas.length}`);
    console.log(`Já descobertas:   ${cartas.length - faltando.length}`);
    console.log(`A marcar:         ${faltando.length}`);

    if (faltando.length === 0) {
        console.log('\nNada a fazer — o jogador já descobriu todas essas cartas.');
        await mongoose.disconnect();
        return;
    }

    // Operação em massa pede confirmação explícita.
    if (args.tudo && !args.confirmar) {
        console.log(`\n👀 Simulação: ${faltando.length} carta(s) seriam marcadas como descobertas.`);
        console.log('   Para executar de verdade, adicione --confirmar');
        await mongoose.disconnect();
        return;
    }

    // Mostra uma amostra do que vai entrar, para conferência.
    console.log('\nExemplos do que será marcado:');
    for (const c of faltando.slice(0, 8)) {
        console.log(`   • ${c.name} — ${c.series} (${c.rarity})`);
    }
    if (faltando.length > 8) console.log(`   ...e mais ${faltando.length - 8}`);

    // ---- Grava ----
    // $push com $each em vez de $addToSet: os itens têm firstObtainedAt,
    // então dois objetos "iguais" nunca seriam idênticos para o $addToSet.
    // A deduplicação já foi feita acima, comparando os ids.
    const agora = new Date();
    const LOTE = 500;
    let gravadas = 0;

    for (let i = 0; i < faltando.length; i += LOTE) {
        const lote = faltando.slice(i, i + LOTE);
        await User.updateOne(
            { id: args.user },
            {
                $push: {
                    discovered: {
                        $each: lote.map((c) => ({ cardId: c._id, firstObtainedAt: agora }))
                    }
                }
            },
            { upsert: true }
        );
        gravadas += lote.length;
    }

    console.log(`\n✓ ${gravadas} carta(s) marcada(s) como descoberta(s).`);
    console.log('  (O jogador NÃO recebeu as cartas — só a entrada na Pokédex.)');

    await mostrarProgresso(args.user, '\nPokédex depois');

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
});
