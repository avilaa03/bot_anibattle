/**
 * Lê a telemetria do /roll e ordena os jogadores por suspeita de macro.
 *
 * ## Isto NÃO pune ninguém
 *
 * É uma fila de revisão, não um veredito. Nenhum número aqui aplica
 * banimento, cooldown extra ou qualquer restrição — a decisão continua
 * humana, com os dados na tela. Falso positivo em detecção automática
 * custa mais caro que tolerar um script por mais um mês: o jogador
 * legítimo banido não volta.
 *
 * Quando o painel administrativo do site ganhar a aba de suspeitos, ele
 * deve mostrar exatamente estes números.
 *
 * ## Como ler a saída
 *
 * `pontual%`  — proporção de rolls feitos em menos de 5 s depois do
 *               cooldown vencer. Humano fica bem abaixo de 50%.
 * `desvio`    — desvio-padrão do atraso. É o sinal mais forte: gente não
 *               tem regularidade de segundos. Abaixo de 30 s é bandeira.
 * `silêncio`  — maior sequência de horas seguidas sem rolar. Todo mundo
 *               dorme; menos de 3 h é bandeira.
 * `clique`    — tempo médio entre a carta aparecer e o botão ser clicado.
 *
 * Nenhum sinal sozinho condena. Jogador dedicado pode ser pontual, e quem
 * trabalha de madrugada tem sono deslocado — mas o sono EXISTE. O que
 * denuncia é a soma.
 *
 * Uso:
 *   npm run telemetria:suspeitos
 *   npm run telemetria:suspeitos -- --min=40      # só score >= 40
 *   npm run telemetria:suspeitos -- --top=50
 *   npm run telemetria:suspeitos -- --id=123456   # detalhe de um jogador
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);
const User = require('../Commands/utils/userSchema');
const telemetria = require('../Commands/utils/telemetria');

const brl = (n) => Number(n || 0).toLocaleString('pt-BR');

function argumento(nome, padrao) {
    const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
    if (!achado) return padrao;
    const valor = achado.split('=')[1];
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : valor;
}

function duracao(ms) {
    if (ms === null || ms === undefined) return '—';
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = s / 60;
    if (m < 60) return `${m.toFixed(1)}min`;
    return `${(m / 60).toFixed(1)}h`;
}

/** Barrinha do histograma de 24 horas. */
function grafico(horas) {
    const maximo = Math.max(...horas, 1);
    const niveis = ' ▁▂▃▄▅▆▇█';
    return horas.map((n) => niveis[Math.min(8, Math.round((n / maximo) * 8))]).join('');
}

async function detalhe(id) {
    const user = await User.findOne({ id: String(id) }).lean();
    if (!user) {
        console.log(`Jogador ${id} não encontrado.`);
        return;
    }

    const r = telemetria.resumo(user);

    console.log(`\n=== Jogador ${user.id} ===`);
    console.log(`Rolls medidos:      ${brl(r.totalRolls)}  (amostras de atraso: ${brl(r.amostras)})`);
    console.log(`Score de suspeita:  ${r.score === null ? 'sem dados suficientes' : r.score + '/100'}`);
    console.log('');
    console.log(`Atraso médio:       ${duracao(r.mediaAtrasoMs)}`);
    console.log(`Desvio-padrão:      ${duracao(r.desvioMs)}`);
    console.log(`Rolls "pontuais":   ${(r.taxaPontual * 100).toFixed(1)}%  (< ${telemetria.LIMIAR_PONTUAL_MS / 1000}s do cooldown)`);
    console.log('');
    console.log(`Horas com atividade: ${r.horasAtivas}/24`);
    console.log(`Maior silêncio:      ${r.maiorSilencioHoras}h seguidas`);
    console.log(`Atividade por hora (UTC 0h -> 23h):`);
    console.log(`  ${grafico(r.horas)}`);
    console.log(`  0h      6h      12h     18h   23h`);
    console.log('');
    console.log(`Clique médio:       ${duracao(r.mediaCliqueMs)}  (${brl(r.cliques)} amostras)`);
    console.log(`Cliques rápidos:    ${(r.taxaCliqueRapido * 100).toFixed(1)}%  (< ${telemetria.LIMIAR_CLIQUE_MS}ms)`);

    const ultimos = (user.telemetria?.ultimosRolls || []).slice(-15);
    if (ultimos.length > 0) {
        console.log('\nÚltimos rolls (atraso depois do cooldown vencer):');
        for (const roll of ultimos) {
            console.log(`  ${new Date(roll.em).toISOString().replace('T', ' ').slice(0, 19)}  +${duracao(roll.atrasoMs)}`);
        }
    }
}

async function fila(minimo, top) {
    const candidatos = await User.find({
        'telemetria.pontualidade.amostras': { $gte: telemetria.AMOSTRAS_MINIMAS }
    }).lean();

    const linhas = candidatos
        .map((u) => ({ id: u.id, ...telemetria.resumo(u) }))
        .filter((r) => r.score !== null && r.score >= minimo)
        .sort((a, b) => b.score - a.score)
        .slice(0, top);

    const total = await User.countDocuments();
    console.log(`\n=== Fila de revisão ===`);
    console.log(`${brl(total)} jogador(es) no banco • ${brl(candidatos.length)} com ${telemetria.AMOSTRAS_MINIMAS}+ amostras\n`);

    if (linhas.length === 0) {
        console.log(`Ninguém com score >= ${minimo}.`);
        if (candidatos.length === 0) {
            console.log('\nA telemetria ainda está juntando dados. Cada jogador precisa de');
            console.log(`${telemetria.AMOSTRAS_MINIMAS} rolls medidos antes de receber um score — em ritmo normal,`);
            console.log('isso leva alguns dias. Volte aqui depois.');
        }
        return;
    }

    console.log('score  jogador              rolls  pontual%  desvio    silêncio  clique    atividade (0h-23h UTC)');
    console.log('─────  ───────────────────  ─────  ────────  ────────  ────────  ────────  ────────────────────────');
    for (const r of linhas) {
        console.log(
            `${String(r.score).padStart(4)}   `
            + `${r.id.padEnd(19)}  `
            + `${String(brl(r.totalRolls)).padStart(5)}  `
            + `${(r.taxaPontual * 100).toFixed(0).padStart(7)}%  `
            + `${duracao(r.desvioMs).padStart(8)}  `
            + `${(r.maiorSilencioHoras + 'h').padStart(8)}  `
            + `${duracao(r.mediaCliqueMs).padStart(8)}  `
            + grafico(r.horas)
        );
    }

    console.log('\nDetalhe de um jogador:  npm run telemetria:suspeitos -- --id=<discordId>');
    console.log('\n⚠️  Score alto NÃO é prova. É ordem de revisão — olhe o detalhe antes');
    console.log('    de qualquer decisão, e prefira o cooldown progressivo ao banimento.');
}

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const id = argumento('id', null);
    if (id) await detalhe(id);
    else await fila(argumento('min', 0), argumento('top', 25));

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Erro ao ler a telemetria:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
