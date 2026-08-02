/**
 * Restauração de backup.
 *
 * Um backup que você nunca testou restaurar não é um backup — é uma
 * esperança. Rode este script pelo menos uma vez, apontando para um banco
 * de teste, antes de precisar dele de verdade.
 *
 * Uso:
 *   npm run restore -- --de backups/2026-08-02T04-00-00
 *   npm run restore -- --de backups/... --confirmar    (executa de fato)
 *
 * Sem --confirmar, o script só mostra o que faria. É proposital: restaurar
 * SUBSTITUI os dados atuais, e isso não tem desfazer.
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const mongoose = require('mongoose');

function parseArgs(argv) {
    const args = { de: null, confirmar: false, colecao: null };
    for (let i = 2; i < argv.length; i++) {
        const chave = argv[i];
        const valor = argv[i + 1];
        if (chave === '--de' && valor) { args.de = valor; i++; }
        else if (chave === '--colecao' && valor) { args.colecao = valor; i++; }
        else if (chave === '--confirmar') { args.confirmar = true; }
    }
    return args;
}

function perguntar(pergunta) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(pergunta, (resposta) => { rl.close(); resolve(resposta); }));
}

async function main() {
    const args = parseArgs(process.argv);

    if (!args.de) {
        console.error('Informe a pasta do backup: --de backups/2026-08-02T04-00-00');
        process.exit(1);
    }

    const pasta = path.isAbsolute(args.de) ? args.de : path.join(process.cwd(), args.de);
    const manifestoPath = path.join(pasta, 'manifest.json');

    if (!fs.existsSync(manifestoPath)) {
        console.error(`manifest.json não encontrado em ${pasta}. Essa pasta é mesmo um backup?`);
        process.exit(1);
    }

    const manifesto = JSON.parse(fs.readFileSync(manifestoPath, 'utf8'));

    console.log(`Backup de ${manifesto.criadoEm}`);
    console.log(`Banco de origem: ${manifesto.banco}`);
    console.log(`${manifesto.totalDocumentos} documentos em ${manifesto.colecoes.length} coleção(ões)\n`);

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    console.log(`Banco de destino: ${db.databaseName}\n`);

    const alvos = args.colecao
        ? manifesto.colecoes.filter((c) => c.colecao === args.colecao)
        : manifesto.colecoes;

    if (alvos.length === 0) {
        console.error(`Coleção "${args.colecao}" não existe neste backup.`);
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log('O que será feito:');
    for (const { colecao, documentos } of alvos) {
        const atuais = await db.collection(colecao).countDocuments();
        console.log(`  ${colecao.padEnd(20)} substituir ${String(atuais).padStart(7)} doc(s) atuais por ${String(documentos).padStart(7)} do backup`);
    }

    if (!args.confirmar) {
        console.log('\n👀 Simulação apenas. Para executar de verdade, adicione --confirmar');
        await mongoose.disconnect();
        return;
    }

    console.log('\n⚠️  ISTO APAGA OS DADOS ATUAIS DAS COLEÇÕES ACIMA E NÃO TEM DESFAZER.');
    const resposta = await perguntar(`Digite o nome do banco de destino (${db.databaseName}) para confirmar: `);
    if (resposta.trim() !== db.databaseName) {
        console.log('Nome não confere. Restauração cancelada.');
        await mongoose.disconnect();
        return;
    }

    for (const { colecao } of alvos) {
        const arquivo = path.join(pasta, `${colecao}.json.gz`);
        if (!fs.existsSync(arquivo)) {
            console.log(`  ⚠️  ${colecao}: arquivo ausente, pulando.`);
            continue;
        }

        const documentos = JSON.parse(zlib.gunzipSync(fs.readFileSync(arquivo)).toString('utf8'));

        await db.collection(colecao).deleteMany({});
        if (documentos.length > 0) {
            // Em lotes, para não estourar o limite de tamanho de operação.
            for (let i = 0; i < documentos.length; i += 500) {
                await db.collection(colecao).insertMany(documentos.slice(i, i + 500), { ordered: false });
            }
        }
        console.log(`  ✓ ${colecao}: ${documentos.length} documento(s) restaurado(s)`);
    }

    console.log('\n✅ Restauração concluída.');
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro na restauração:', err);
    process.exit(1);
});
