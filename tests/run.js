/**
 * Roda todos os testes da pasta tests/.
 * Uso: npm test
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arquivos = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.test.js'))
    .sort();

let falhou = false;

for (const arquivo of arquivos) {
    console.log(`\n──────── ${arquivo} ────────`);
    try {
        execFileSync(process.execPath, [path.join(__dirname, arquivo)], { stdio: 'inherit' });
    } catch (err) {
        falhou = true;
    }
}

console.log(falhou ? '\n❌ Há testes falhando.' : `\n✅ ${arquivos.length} arquivo(s) de teste, tudo passando.`);
process.exit(falhou ? 1 : 0);
