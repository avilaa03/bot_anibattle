/**
 * Marca quem jogou a beta.
 *
 * ## Por que isto é urgente e não pode esperar
 *
 * A ideia é dar uma carta exclusiva a quem esteve na beta. Só que não
 * existe nenhum campo dizendo "este jogador estava aqui" — existem
 * `stats.rolls` e `stats.diasAtivos`, mas nenhuma marca temporal.
 *
 * Enquanto a beta está aberta, "quem jogou a beta" é uma pergunta com
 * resposta objetiva: quem tem atividade AGORA. Depois que ela terminar e
 * chegar gente nova, a mesma pergunta vira uma discussão sem resposta —
 * os contadores continuam subindo e ninguém consegue separar quem já
 * estava de quem chegou depois.
 *
 * Rodar este script é o que congela essa fotografia.
 *
 * ## A régua
 *
 * O padrão é 1 roll: quem chegou a rolar uma carta participou. Uma régua
 * mais dura exclui exatamente quem entrou perto do fim, que é quem menos
 * merece ser punido por ter chegado tarde. Se você quiser algo mais
 * restrito, `--minimo=N`.
 *
 * ## Idempotente
 *
 * Rodar duas vezes não muda nada: quem já está marcado é ignorado, e
 * `rollsNaEpoca` guarda o número do momento da PRIMEIRA marcação — é o
 * que torna a decisão auditável daqui a um ano, quando alguém perguntar
 * por que fulano recebeu a carta e beltrano não.
 *
 * Uso:
 *   npm run beta:marcar                      # simulação
 *   npm run beta:marcar -- --confirmar       # aplica
 *   npm run beta:marcar -- --minimo=5        # régua mais dura
 *   npm run beta:marcar -- --listar          # só mostra quem já está marcado
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);
const User = require('../Commands/utils/userSchema');

const brl = (n) => Number(n || 0).toLocaleString('pt-BR');

function argumento(nome, padrao) {
    const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
    if (!achado) return padrao;
    const valor = Number(achado.split('=')[1]);
    return Number.isFinite(valor) ? valor : padrao;
}

/**
 * A data em que o jogador apareceu pela primeira vez.
 *
 * Não existe `criadoEm` no schema, então a melhor aproximação é a carta
 * mais antiga do inventário. Quem vendeu tudo cai no `_id` do documento,
 * que no Mongo carrega o timestamp da criação.
 */
function primeiraAtividade(user) {
    const datas = (user.inventory || [])
        .map((c) => c.obtainedAt)
        .filter(Boolean)
        .map((d) => new Date(d).getTime());

    if (datas.length > 0) return new Date(Math.min(...datas));

    try {
        return user._id.getTimestamp();
    } catch {
        return null;
    }
}

async function listar() {
    const marcados = await User.find({ 'beta.participou': true })
        .select('id beta stats')
        .sort({ 'beta.rollsNaEpoca': -1 })
        .lean();

    console.log(`\n=== ${brl(marcados.length)} jogador(es) marcado(s) como beta ===\n`);
    for (const u of marcados) {
        const desde = u.beta?.desde ? new Date(u.beta.desde).toISOString().slice(0, 10) : '—';
        console.log(
            `  ${u.id.padEnd(20)} rolls na época: ${String(brl(u.beta?.rollsNaEpoca || 0)).padStart(6)}`
            + `   hoje: ${String(brl(u.stats?.rolls || 0)).padStart(6)}   desde ${desde}`
        );
    }
    if (marcados.length === 0) {
        console.log('  (ninguém ainda — rode sem --listar para marcar)');
    }
}

async function marcar(minimo, confirmar) {
    const candidatos = await User.find({
        'beta.participou': { $ne: true },
        'stats.rolls': { $gte: minimo }
    }).select('id stats inventory.obtainedAt beta').lean();

    console.log(`\n▶ Régua: pelo menos ${brl(minimo)} roll(s).`);
    console.log(`▶ Candidatos ainda não marcados: ${brl(candidatos.length)}`);

    if (candidatos.length === 0) {
        console.log('  Nada a fazer.');
        return 0;
    }

    const agora = new Date();
    const amostra = [];

    for (const user of candidatos) {
        const desde = primeiraAtividade(user);
        const rolls = user.stats?.rolls || 0;

        if (amostra.length < 10) {
            amostra.push(
                `  ${user.id.padEnd(20)} ${String(brl(rolls)).padStart(6)} roll(s)`
                + `   desde ${desde ? desde.toISOString().slice(0, 10) : '—'}`
            );
        }

        if (confirmar) {
            await User.updateOne(
                { id: user.id },
                {
                    $set: {
                        'beta.participou': true,
                        'beta.desde': desde,
                        'beta.rollsNaEpoca': rolls,
                        'beta.marcadoEm': agora
                    }
                }
            );
        }
    }

    console.log('\nAmostra:');
    for (const linha of amostra) console.log(linha);
    if (candidatos.length > amostra.length) {
        console.log(`  ... e mais ${brl(candidatos.length - amostra.length)}.`);
    }

    return candidatos.length;
}

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    if (process.argv.includes('--listar')) {
        await listar();
        await mongoose.disconnect();
        return;
    }

    const confirmar = process.argv.includes('--confirmar');
    const minimo = argumento('minimo', 1);

    console.log(confirmar ? '=== SNAPSHOT DA BETA (aplicando) ===' : '=== SNAPSHOT DA BETA (simulação) ===');

    const totalJogadores = await User.countDocuments();
    const jaMarcados = await User.countDocuments({ 'beta.participou': true });
    console.log(`Jogadores no banco: ${brl(totalJogadores)} • já marcados: ${brl(jaMarcados)}`);

    const marcados = await marcar(minimo, confirmar);

    console.log('\n=== RESUMO ===');
    console.log(`Marcados nesta rodada: ${brl(marcados)}`);
    console.log(`Total de beta depois:  ${brl(jaMarcados + (confirmar ? marcados : 0))}`);

    if (!confirmar) {
        console.log('\n>> Simulação. Nada foi gravado.');
        console.log('>> Para aplicar: npm run beta:marcar -- --confirmar');
    } else {
        console.log('\n✅ Snapshot gravado. A partir de agora ele não muda sozinho.');
        console.log('   Quem chegar depois NÃO será marcado, que é o objetivo.');
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Erro ao marcar a beta:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
