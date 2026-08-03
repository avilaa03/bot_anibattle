/**
 * Lista e cancela torneios abertos.
 *
 * Serve de saída de emergência: se a mensagem do torneio foi apagada, se
 * o bot está fora do ar, ou se algo travou de um jeito que os botões não
 * resolvem, isto destrava o servidor sem precisar mexer no banco na mão.
 *
 * No dia a dia prefira o botão dentro do Discord — ele avisa os
 * participantes e edita a mensagem original. Este script é o plano B.
 *
 * Uso:
 *   npm run torneios:limpar                    # lista o que está aberto
 *   npm run torneios:limpar -- --tudo          # cancela todos os abertos
 *   npm run torneios:limpar -- --id tn1a2b3c   # cancela um específico
 *   npm run torneios:limpar -- --servidor 123  # cancela os de um servidor
 *
 * Cancelar devolve a taxa de inscrição de quem pagou.
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const Tournament = require('../Commands/utils/tournamentSchema');
const torneio = require('../Commands/utils/tournament');

function parseArgs(argv) {
    const args = { tudo: false, id: null, servidor: null };
    for (let i = 2; i < argv.length; i++) {
        const chave = argv[i];
        const valor = argv[i + 1];
        if (chave === '--tudo') args.tudo = true;
        else if (chave === '--id' && valor) { args.id = valor; i++; }
        else if (chave === '--servidor' && valor) { args.servidor = valor; i++; }
    }
    return args;
}

function idade(criadoEm) {
    const minutos = Math.round((Date.now() - new Date(criadoEm).getTime()) / 60000);
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    return horas < 24 ? `${horas}h` : `${Math.floor(horas / 24)} dia(s)`;
}

async function main() {
    const args = parseArgs(process.argv);

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const filtro = { fase: { $in: ['inscricoes', 'emandamento'] } };
    if (args.id) filtro.tournamentId = args.id;
    if (args.servidor) filtro.guildId = args.servidor;

    const abertos = await Tournament.find(filtro).sort({ criadoEm: 1 }).lean();

    if (abertos.length === 0) {
        console.log('\nNenhum torneio aberto' + (args.id || args.servidor ? ' com esse filtro.' : '.'));
        await mongoose.disconnect();
        return;
    }

    console.log(`\n${abertos.length} torneio(s) aberto(s):\n`);
    for (const t of abertos) {
        const travado = t.fase === 'emandamento'
            ? '  ⚠️  travado em execução (o bot caiu no meio)'
            : '';
        console.log(`  ${t.tournamentId}  "${t.nome}"`);
        console.log(`    servidor ${t.guildId} • ${t.fase} • ${t.participantes.length}/${t.vagas} inscritos`);
        console.log(`    criado há ${idade(t.criadoEm)} por ${t.criadorId}`);
        if (t.taxaInscricao > 0) {
            console.log(`    inscrição ${t.taxaInscricao} • prêmio acumulado ${t.premio}`);
        }
        if (travado) console.log(travado);
        console.log('');
    }

    // Sem --tudo nem --id, só lista. Cancelar é destrutivo o suficiente
    // para não acontecer por engano de digitação.
    if (!args.tudo && !args.id) {
        console.log('Nada foi cancelado. Para cancelar:');
        console.log('  npm run torneios:limpar -- --id <id do torneio>');
        console.log('  npm run torneios:limpar -- --tudo');
        await mongoose.disconnect();
        return;
    }

    let devolvido = 0;
    for (const t of abertos) {
        await torneio.cancelar(t.tournamentId);
        devolvido += t.taxaInscricao * t.participantes.length;
        console.log(`✓ ${t.tournamentId} cancelado.`);
    }

    console.log(`\n${abertos.length} torneio(s) cancelado(s).`);
    if (devolvido > 0) console.log(`${devolvido} moeda(s) devolvida(s) aos inscritos.`);
    console.log('\n⚠️  A mensagem no Discord continua mostrando os botões antigos.');
    console.log('   Clicar neles agora responde "Torneio não encontrado" — sem efeito colateral.');

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
});
