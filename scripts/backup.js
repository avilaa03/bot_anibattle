/**
 * Backup do banco de dados.
 *
 * O plano gratuito do MongoDB Atlas (M0) NÃO faz backup automático. Como
 * os jogadores acumulam cartas e moedas por meses, perder o banco uma vez
 * significa perder o projeto. Este script exporta todas as coleções para
 * arquivos JSON comprimidos.
 *
 * Uso:
 *   npm run backup
 *   npm run backup -- --dir /caminho/dos/backups --manter 14
 *
 * Automatize com cron (todo dia às 4h da manhã):
 *   0 4 * * * cd /caminho/do/bot && /usr/bin/npm run backup >> /var/log/anibattle-backup.log 2>&1
 *
 * Guarde uma cópia FORA do servidor. Backup que mora no mesmo lugar que o
 * banco não protege contra o cenário mais comum (perder o servidor).
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');

const PADRAO_MANTER = 7;

function parseArgs(argv) {
    const args = { dir: path.join(__dirname, '..', 'backups'), manter: PADRAO_MANTER };
    for (let i = 2; i < argv.length; i++) {
        const chave = argv[i];
        const valor = argv[i + 1];
        if (chave === '--dir' && valor) { args.dir = valor; i++; }
        else if (chave === '--manter' && valor) { args.manter = Math.max(1, parseInt(valor, 10) || PADRAO_MANTER); i++; }
    }
    return args;
}

function formatarTamanho(bytes) {
    const kb = bytes / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(0)} KB`;
}

function carimbo() {
    // 2026-08-02T04-30-00 — ordenável alfabeticamente, sem caractere
    // inválido para nome de arquivo.
    return new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
}

/** Apaga backups antigos, mantendo os N mais recentes. */
function rotacionar(dir, manter) {
    const pastas = fs.readdirSync(dir)
        .filter((nome) => /^\d{4}-\d{2}-\d{2}T/.test(nome))
        .filter((nome) => fs.statSync(path.join(dir, nome)).isDirectory())
        .sort()
        .reverse();

    const excedente = pastas.slice(manter);
    for (const pasta of excedente) {
        fs.rmSync(path.join(dir, pasta), { recursive: true, force: true });
        console.log(`  🗑️  removido backup antigo: ${pasta}`);
    }
    return excedente.length;
}

async function main() {
    const args = parseArgs(process.argv);

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    const inicio = Date.now();
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;
    const nomeBanco = db.databaseName;

    // Guarda contra o erro clássico de conectar no banco errado: se a URI
    // não tiver o nome do banco, o driver cai em "test" e o backup sai vazio.
    if (nomeBanco === 'test') {
        console.error('⚠️  Conectado ao banco "test". Sua MONGODB_URI provavelmente está sem o nome do banco no caminho.');
        console.error('   Exemplo correto: mongodb+srv://user:senha@cluster.mongodb.net/AnimeFightDB?appName=...');
        await mongoose.disconnect();
        process.exit(1);
    }

    const destino = path.join(args.dir, carimbo());
    fs.mkdirSync(destino, { recursive: true });

    console.log(`Banco: ${nomeBanco}`);
    console.log(`Destino: ${destino}\n`);

    const colecoes = await db.listCollections().toArray();
    const resumo = [];
    let bytesTotais = 0;

    for (const { name } of colecoes) {
        const documentos = await db.collection(name).find({}).toArray();
        const json = JSON.stringify(documentos);
        const comprimido = zlib.gzipSync(json, { level: 9 });

        const arquivo = path.join(destino, `${name}.json.gz`);
        fs.writeFileSync(arquivo, comprimido);

        bytesTotais += comprimido.length;
        resumo.push({ colecao: name, documentos: documentos.length, bytes: comprimido.length });
        console.log(`  ✓ ${name.padEnd(20)} ${String(documentos.length).padStart(7)} docs  ${formatarTamanho(comprimido.length).padStart(10)}`);
    }

    // Manifesto: serve para conferir a integridade na hora de restaurar.
    const manifesto = {
        banco: nomeBanco,
        criadoEm: new Date().toISOString(),
        colecoes: resumo,
        totalDocumentos: resumo.reduce((s, c) => s + c.documentos, 0),
        totalBytes: bytesTotais
    };
    fs.writeFileSync(path.join(destino, 'manifest.json'), JSON.stringify(manifesto, null, 2));

    console.log(`\n✅ Backup concluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
    console.log(`   ${manifesto.totalDocumentos} documentos, ${formatarTamanho(bytesTotais)}`);

    const removidos = rotacionar(args.dir, args.manter);
    if (removidos > 0) console.log(`   ${removidos} backup(s) antigo(s) removido(s), mantendo os ${args.manter} mais recentes.`);

    if (manifesto.totalDocumentos === 0) {
        console.log('\n⚠️  O backup saiu VAZIO. Confira se a URI aponta para o banco certo.');
    }

    console.log('\n💡 Lembre-se de copiar esta pasta para fora do servidor.');

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro no backup:', err);
    process.exit(1);
});
