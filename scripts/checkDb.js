/**
 * Diagnóstico da conexão com o MongoDB.
 *
 * Rode isto sempre que o bot parecer "sem dados": é mais rápido do que
 * subir o bot inteiro e o script traduz os erros mais comuns do Atlas,
 * que por padrão vêm bem crípticos.
 *
 * Uso:
 *   npm run check:db
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const TIMEOUT_MS = 10000;

// Coleções que o bot espera encontrar, e para que servem.
const ESPERADAS = {
    'new-cards': 'catálogo de cartas',
    users: 'jogadores',
    markets: 'anúncios do mercado',
    battles: 'batalhas em andamento',
    payments: 'histórico de pagamentos'
};

const RARIDADES = ['common', 'rare', 'ultra rare', 'legendary', 'master'];

/** Esconde a senha antes de imprimir a URI em qualquer lugar. */
function mascarar(uri) {
    return String(uri).replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

/** Traduz os erros de conexão mais comuns para algo acionável. */
function explicarErro(err) {
    const msg = String(err.message || err);

    if (/Authentication failed|bad auth/i.test(msg)) {
        return [
            'Usuário ou senha incorretos.',
            '→ Confira as credenciais em MONGODB_URI.',
            '→ Se a senha tem caracteres especiais (@ : / ? # etc), ela precisa estar codificada em percent-encoding.',
            '   Exemplo: a senha "p@ss:1" vira "p%40ss%3A1".'
        ];
    }
    if (/IP that isn't whitelisted|not allowed to connect|whitelist/i.test(msg)) {
        return [
            'O IP desta máquina não está liberado no Atlas.',
            '→ Atlas > Network Access > Add IP Address.',
            '→ Se está rodando no seu computador, use "Add Current IP Address".',
            '→ Se está no servidor, adicione o IP do VPS.'
        ];
    }
    if (/ENOTFOUND|EAI_AGAIN|querySrv/i.test(msg)) {
        return [
            'Não foi possível resolver o endereço do cluster.',
            '→ Confira se o host em MONGODB_URI está escrito certo.',
            '→ Verifique sua conexão de internet / DNS.'
        ];
    }
    if (/timed out|ETIMEDOUT|ServerSelectionError/i.test(msg)) {
        return [
            'Tempo esgotado ao conectar.',
            '→ Quase sempre é IP não liberado no Atlas (Network Access).',
            '→ Pode ser também firewall bloqueando a porta 27017.'
        ];
    }
    return ['Erro não reconhecido. Mensagem original acima.'];
}

async function main() {
    console.log('🔍 Diagnóstico do banco de dados\n');

    // ---- 1. A variável existe? ----
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI não definido.');
        console.error('   → Copie .env.exemple para .env e preencha.');
        process.exit(1);
    }
    console.log(`URI: ${mascarar(uri)}`);

    // ---- 2. A URI tem o nome do banco no caminho? ----
    // Este é o erro que já derrubou o /roll antes: sem o nome do banco, o
    // driver conecta no banco padrão "test", que está vazio.
    const semNomeDeBanco = /mongodb(\+srv)?:\/\/[^/]+\/?(\?|$)/.test(uri);
    if (semNomeDeBanco) {
        console.log('\n⚠️  A URI parece não ter o nome do banco no caminho.');
        console.log('   Sem isso o driver conecta no banco "test" e todas as consultas voltam vazias.');
        console.log('   Correto:  ...mongodb.net/AnimeFightDB?appName=...');
        console.log('   Errado:   ...mongodb.net/?appName=...');
    }

    // ---- 3. Conectar ----
    const inicio = Date.now();
    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: TIMEOUT_MS });
    } catch (err) {
        console.error(`\n❌ Não foi possível conectar (${Date.now() - inicio}ms)`);
        console.error(`   ${err.message}\n`);
        for (const linha of explicarErro(err)) console.error(`   ${linha}`);
        process.exit(1);
    }
    const msConexao = Date.now() - inicio;

    const db = mongoose.connection.db;
    console.log(`\n✅ Conectado em ${msConexao}ms`);
    console.log(`   Banco: ${db.databaseName}`);

    if (db.databaseName === 'test') {
        console.log('\n❌ Você está conectado ao banco "test" — quase certamente não é o que você quer.');
        console.log('   Adicione o nome do banco na URI, antes do "?".');
        await mongoose.disconnect();
        process.exit(1);
    }

    // ---- 4. Latência de leitura ----
    const inicioPing = Date.now();
    await db.admin().ping();
    const msPing = Date.now() - inicioPing;
    const avaliacao = msPing < 100 ? '🟢 ótima' : msPing < 300 ? '🟡 aceitável' : '🔴 alta';
    console.log(`   Latência: ${msPing}ms (${avaliacao})`);
    if (msPing >= 300) {
        console.log('   → Latência alta deixa os comandos lentos. Considere um cluster na mesma região do servidor.');
    }

    // ---- 5. Coleções ----
    const colecoes = await db.listCollections().toArray();
    const nomes = colecoes.map((c) => c.name);

    console.log('\n📦 Coleções:');
    if (nomes.length === 0) {
        console.log('   (nenhuma — banco vazio)');
    }
    for (const [nome, descricao] of Object.entries(ESPERADAS)) {
        if (nomes.includes(nome)) {
            const total = await db.collection(nome).countDocuments();
            console.log(`   ✓ ${nome.padEnd(12)} ${String(total).padStart(7)} doc(s)  — ${descricao}`);
        } else {
            const opcional = ['battles', 'payments', 'markets'].includes(nome);
            console.log(`   ${opcional ? '·' : '⚠️'} ${nome.padEnd(12)} ${'ausente'.padStart(7)}         — ${descricao}${opcional ? ' (normal se ainda não foi usada)' : ''}`);
        }
    }

    const extras = nomes.filter((n) => !Object.keys(ESPERADAS).includes(n));
    if (extras.length > 0) {
        console.log(`   (outras: ${extras.join(', ')})`);
    }

    // ---- 6. O catálogo tem carta de cada raridade? ----
    if (nomes.includes('new-cards')) {
        const porRaridade = await db.collection('new-cards').aggregate([
            { $group: { _id: '$rarity', total: { $sum: 1 } } }
        ]).toArray();
        const mapa = Object.fromEntries(porRaridade.map((r) => [r._id, r.total]));

        console.log('\n🎴 Catálogo por raridade:');
        let faltando = [];
        for (const r of RARIDADES) {
            const total = mapa[r] || 0;
            console.log(`   ${total > 0 ? '✓' : '⚠️'} ${r.padEnd(11)} ${String(total).padStart(6)}`);
            if (total === 0) faltando.push(r);
        }
        if (faltando.length > 0) {
            console.log(`\n   ⚠️  Sem cartas em: ${faltando.join(', ')}.`);
            console.log('   O /roll cai silenciosamente para "common" quando sorteia uma raridade vazia.');
            console.log('   → npm run import:anilist -- --pages 20   e depois   npm run seed:cards <arquivo>');
        }
    }

    // ---- 7. Escrita funciona? ----
    // Ler pode funcionar e escrever não, se o usuário do banco for
    // somente-leitura. Testamos com uma coleção descartável.
    try {
        const teste = db.collection('_checkdb_temp');
        await teste.insertOne({ criadoEm: new Date() });
        await teste.deleteMany({});
        await teste.drop().catch(() => {});
        console.log('\n✍️  Escrita: ✅ funcionando');
    } catch (err) {
        console.log('\n✍️  Escrita: ❌ FALHOU');
        console.log(`   ${err.message}`);
        console.log('   → O usuário do banco provavelmente é somente-leitura.');
        console.log('   → Atlas > Database Access > edite o usuário > "Read and write to any database".');
    }

    // ---- 8. Índices ----
    if (nomes.includes('users')) {
        const indices = await db.collection('users').indexes();
        console.log(`\n🗂️  Índices em "users": ${indices.length} (${indices.map((i) => i.name).join(', ')})`);
        if (indices.length <= 1) {
            console.log('   ⚠️  Só o índice padrão. Suba o bot uma vez para o Mongoose criar os demais.');
        }
    }

    console.log('\n✅ Diagnóstico concluído.');
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('\n❌ Erro inesperado no diagnóstico:');
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
