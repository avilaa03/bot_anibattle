/**
 * Convenções do projeto que já quebraram o bot na prática.
 *
 * Cada regra aqui existe porque um bug real aconteceu. São verificações
 * de código-fonte, não de comportamento — rodam em milissegundos e não
 * precisam de banco nem de Discord.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const IGNORAR = new Set(['node_modules', '.git', '.next', 'preview']);

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

/** Todos os .js do projeto, com caminho relativo à raiz. */
function listarArquivos(dir = RAIZ, acumulado = []) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORAR.has(entrada.name)) continue;
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) listarArquivos(completo, acumulado);
        else if (entrada.name.endsWith('.js')) acumulado.push(completo);
    }
    return acumulado;
}

// Este arquivo sai da lista: os comentários dele citam justamente os
// padrões proibidos como exemplo, e ele acusaria a si mesmo.
const arquivos = listarArquivos().filter((a) => a !== __filename);
const ler = (p) => fs.readFileSync(p, 'utf8');
const relativo = (p) => path.relative(RAIZ, p);

console.log(`Verificando ${arquivos.length} arquivos.\n`);

// ---------------------------------------------------------------------
console.log('=== Caixa dos caminhos nos require ===');
//
// O macOS não diferencia maiúsculas de minúsculas no sistema de arquivos,
// então `require('./commands/...')` e `require('./Commands/...')` abrem o
// mesmo arquivo. Só que o Node guarda o cache de módulos pela STRING do
// caminho: as duas grafias viram DOIS módulos independentes, com estado
// separado. Foi assim que o `cardSchema` foi carregado duas vezes e
// estourou "Cannot overwrite `Card` model once compiled" ao clicar em
// entrar num torneio.
//
// Em Linux (o VPS) é pior: o caminho com a caixa errada simplesmente não
// existe e o bot não sobe.
//
// Esta verificação compara a grafia escrita no require com o nome REAL no
// disco, lendo o diretório — `fs.existsSync` não serviria, porque no
// macOS ele responde "existe" para a caixa errada.

/** O nome existe no diretório com exatamente essa grafia? */
function existeComEssaCaixa(dir, nome) {
    try {
        return fs.readdirSync(dir).includes(nome);
    } catch {
        return false;
    }
}

const problemasDeCaixa = [];

for (const arquivo of arquivos) {
    const src = ler(arquivo);
    // Só require com caminho literal relativo. Ignora template strings e
    // caminhos montados em variável (o registry monta o dele com path.join).
    for (const m of src.matchAll(/require\(\s*'(\.[^']+)'\s*\)/g)) {
        const especificado = m[1];
        let atual = path.dirname(arquivo);
        const partes = especificado.split('/');

        for (let i = 0; i < partes.length; i++) {
            const parte = partes[i];
            if (parte === '.' || parte === '') continue;
            if (parte === '..') { atual = path.dirname(atual); continue; }

            const ultimo = i === partes.length - 1;
            const candidatos = ultimo ? [parte, `${parte}.js`] : [parte];

            const achado = candidatos.find((c) => existeComEssaCaixa(atual, c));
            if (!achado) {
                problemasDeCaixa.push(`${relativo(arquivo)} -> ${especificado}`);
                break;
            }
            atual = path.join(atual, achado);
        }
    }
}

check(
    'todo require aponta para o nome real no disco',
    problemasDeCaixa.length === 0,
    problemasDeCaixa.length ? `\n     ${problemasDeCaixa.join('\n     ')}` : ''
);

// ---------------------------------------------------------------------
console.log('\n=== Model do mongoose registrado uma vez só ===');
//
// Rede de segurança para o mesmo problema: se um schema for carregado
// duas vezes por qualquer motivo, tem que reaproveitar o model já
// compilado em vez de derrubar o bot.

/**
 * Remove comentários antes de procurar padrões no código.
 *
 * A primeira versão desta verificação procurava "mongoose.models" no
 * arquivo inteiro — e passava a achar isso no COMENTÁRIO que explica a
 * guarda, mesmo depois de alguém remover a guarda de verdade. Foi pego
 * reintroduzindo o bug de propósito.
 */
function semComentarios(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

const schemas = arquivos.filter((a) => /Schema\.js$/i.test(path.basename(a)));
const semGuarda = schemas.filter((a) => {
    const codigo = semComentarios(ler(a));
    // Cada `mongoose.model(...)` precisa vir logo depois de um
    // `mongoose.models.X ||` na mesma expressão.
    const registros = [...codigo.matchAll(/mongoose\.model\(/g)];
    return registros.some((m) => {
        const antes = codigo.slice(Math.max(0, m.index - 80), m.index);
        return !/mongoose\.models\.\w+\s*\|\|\s*$/.test(antes);
    });
});

check(
    `os ${schemas.length} schemas usam "mongoose.models.X || mongoose.model(...)"`,
    semGuarda.length === 0,
    semGuarda.length ? `\n     sem guarda: ${semGuarda.map(relativo).join(', ')}` : ''
);

// ---------------------------------------------------------------------
console.log('\n=== Resposta privada usa flags, não o campo depreciado ===');
//
// `ephemeral: true` está depreciado no discord.js e deixa de existir na
// v15. O certo é `flags: MessageFlags.Ephemeral`.

const comEphemeral = arquivos.filter((a) => /\bephemeral\s*:/.test(ler(a)));

check(
    'nenhum arquivo usa "ephemeral:"',
    comEphemeral.length === 0,
    comEphemeral.length ? `\n     ${comEphemeral.map(relativo).join('\n     ')}` : ''
);

// Usar MessageFlags sem importar é erro em tempo de execução, e só
// aparece quando aquele caminho do código roda — pode passar meses.
const semImportarFlags = arquivos.filter((a) => {
    const src = ler(a);
    if (!src.includes('MessageFlags.')) return false;
    return !/\{[^}]*\bMessageFlags\b[^}]*\}\s*=\s*require\(\s*['"]discord\.js['"]\s*\)/.test(src);
});

check(
    'todo arquivo que usa MessageFlags importa MessageFlags',
    semImportarFlags.length === 0,
    semImportarFlags.length ? `\n     ${semImportarFlags.map(relativo).join('\n     ')}` : ''
);

// ---------------------------------------------------------------------
console.log('\n=== Embeds passam pelo módulo central ===');
//
// `utils/embeds.js` é a identidade visual do bot. Comando que monta embed
// direto foge do padrão de cores, emojis e rodapé.

const permitidos = new Set(['Commands/utils/embeds.js', 'index.js']);
const embedDireto = arquivos.filter((a) => {
    const rel = relativo(a).replace(/\\/g, '/');
    if (permitidos.has(rel) || rel.startsWith('tests/') || rel.startsWith('scripts/')) return false;
    return ler(a).includes('new EmbedBuilder(');
});

check(
    'nenhum comando monta embed fora do utils/embeds.js',
    embedDireto.length === 0,
    embedDireto.length ? `\n     ${embedDireto.map(relativo).join('\n     ')}` : ''
);

// ---------------------------------------------------------------------
console.log('\n=== A animação da batalha não toca no jogo ===');
//
// `narracao.js` e `transmissao.js` só reencenam uma batalha já resolvida.
// Se algum dia importarem economia, ELO ou estado de batalha, a animação
// deixa de ser enfeite e vira parte do resultado — e aí uma queda do bot
// no meio da luta passa a poder deixar aposta presa ou partida sem
// vencedor. É exatamente o que o desenho evita.
const APENAS_APRESENTACAO = ['Commands/utils/narracao.js', 'Commands/utils/transmissao.js'];
const PROIBIDOS = ['economy', 'battleState', 'progresso', 'elo', 'userSchema', 'discovery', 'vipService'];

// O treino lê o inventário do jogador (por isso `userSchema` é liberado
// para ele), mas não pode gravar progresso nem mexer em economia.
const TREINO = ['Commands/utils/treino.js', 'Commands/actions/run/treinoRun.js'];
const PROIBIDOS_TREINO = ['economy', 'battleState', 'progresso', 'elo', 'discovery', 'vipService'];

const vazamentos = [];
for (const arquivo of APENAS_APRESENTACAO) {
    const completo = path.join(RAIZ, arquivo);
    if (!fs.existsSync(completo)) continue;

    // Só os `require` de verdade — procurar a palavra solta no arquivo dá
    // falso positivo bobo ("elo" casa dentro de "pelo", "modelo").
    const requires = [...ler(completo).matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
    for (const dep of requires) {
        const nome = path.basename(dep, '.js');
        if (PROIBIDOS.includes(nome)) vazamentos.push(`${arquivo} -> ${dep}`);
    }
}

check(
    'a camada de apresentação não importa estado de jogo',
    vazamentos.length === 0,
    vazamentos.length ? `\n     ${vazamentos.join('\n     ')}` : ''
);

// ---------------------------------------------------------------------
console.log('\n=== O treino não vale nada ===');
//
// `/treino` existe para o jogador testar o time sem consequência. No dia
// em que alguém achar natural "só contar o treino nas estatísticas", isso
// vira farm de missão e conquista sem risco nenhum. Este teste é a trava.
const vazamentosTreino = [];
for (const arquivo of TREINO) {
    const completo = path.join(RAIZ, arquivo);
    if (!fs.existsSync(completo)) continue;

    const requires = [...ler(completo).matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
    for (const dep of requires) {
        const nome = path.basename(dep, '.js');
        if (PROIBIDOS_TREINO.includes(nome)) vazamentosTreino.push(`${arquivo} -> ${dep}`);
    }
}

check(
    'o treino não importa economia, ELO nem progressão',
    vazamentosTreino.length === 0,
    vazamentosTreino.length ? `\n     ${vazamentosTreino.join('\n     ')}` : ''
);

console.log(falhas === 0 ? '\n*** TODAS AS CONVENÇÕES OK ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
