/**
 * Testes dos eventos com inscrição.
 *
 * ## O que precisa valer sempre
 *
 * - **O bot NUNCA paga prêmio.** Quem paga é o painel do site. Premiação
 *   cria carta e moeda em massa, e ter dois lugares capazes de pagar é
 *   ter duas chances de pagar duas vezes. O bot inscreve e só.
 * - **Entrar duas vezes não inscreve duas vezes.** A condição fica no
 *   filtro da escrita, não numa leitura anterior — senão dois cliques
 *   rápidos passam pela janela entre ler e escrever, e o painel paga
 *   dobrado para a mesma pessoa.
 * - **A coleção é a mesma dos dois lados.** O bot lê `eventos` pelo
 *   Mongoose e o site escreve em `eventos` pelo driver nativo. Se os
 *   nomes divergirem, o `/evento` fica eternamente vazio sem erro nenhum.
 * - **O nome digitado pelo jogador é escapado.** Ele vira regex, e um
 *   nome com `(` quebraria a consulta enquanto um `.*` casaria com
 *   qualquer evento.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const UTILS = path.join(RAIZ, 'Commands', 'utils') + path.sep;
const RUN = path.join(RAIZ, 'Commands', 'actions', 'run') + path.sep;

const fonteSchema = fs.readFileSync(UTILS + 'eventoSchema.js', 'utf8');
const fonteRun = fs.readFileSync(RUN + 'eventoRun.js', 'utf8');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

console.log('=== O BOT NÃO PAGA PRÊMIO ===');

// A regra de ouro. Se um dia alguém achar prático "já entregar o prêmio
// na inscrição", este teste é o que avisa que isso abre a porta do
// pagamento duplo — o painel não saberia que o bot já pagou.
check('o /evento não mexe no inventário de ninguém',
    !/inventory/.test(fonteRun));
check('o /evento não mexe em saldo',
    !/balance|addBalance/.test(fonteRun));
check('o /evento não mexe na bolsa',
    !/bolsa\.adicionar|require\(.*bolsa/.test(fonteRun));
check('o /evento não marca ninguém como premiado',
    !/premiado:\s*true/.test(fonteRun));

console.log('\n=== INSCRIÇÃO É IDEMPOTENTE ===');

// A condição TEM que estar no filtro da escrita. Uma verificação feita
// antes, em JavaScript, deixa a janela entre ler e escrever aberta.
check('a condição de "ainda não inscrito" está no filtro do updateOne',
    /'participantes\.userId':\s*\{\s*\$ne:/.test(fonteRun));
check('usa updateOne (escrita condicional) e não save()',
    /updateOne/.test(fonteRun) && !/\.save\(\)/.test(fonteRun));
check('confere modifiedCount para saber se entrou de verdade',
    /modifiedCount/.test(fonteRun));
check('o filtro também exige o evento aberto',
    /status:\s*'aberto'/.test(fonteRun));

console.log('\n=== A COLEÇÃO É A MESMA DO PAINEL ===');
check('o schema aponta para a coleção `eventos`',
    /collection:\s*'eventos'/.test(fonteSchema));

console.log('\n=== O NOME DIGITADO É ESCAPADO ===');
check('escapa os caracteres especiais antes de virar RegExp',
    /replace\(\/\[\.\*\+\?\^\$\{\}\(\)\|\[\\\]\\\\\]\/g/.test(fonteRun)
    || /replace\([^)]*\)[^)]*RegExp|RegExp\([^)]*replace/.test(fonteRun));

console.log('\n=== O SCHEMA GUARDA O QUE O PAINEL ESCREVE ===');
check('tem os três tipos de evento',
    /'direto'/.test(fonteSchema) && /'inscricao'/.test(fonteSchema) && /'lote'/.test(fonteSchema));
check('tem os três status',
    /'rascunho'/.test(fonteSchema) && /'aberto'/.test(fonteSchema) && /'encerrado'/.test(fonteSchema));

// Um objeto comum faria o Mongoose descartar as chaves não declaradas —
// e as chaves de item são dinâmicas (`gema`, `caixa_elite`…). O prêmio
// sumiria em silêncio entre o painel e o bot.
check('os itens do prêmio são um Map, não um objeto fixo',
    /itens:\s*\{\s*type:\s*Map/.test(fonteSchema));
check('participante nasce com premiado false',
    /premiado:\s*\{\s*type:\s*Boolean,\s*default:\s*false/.test(fonteSchema));

console.log('\n=== O JOGADOR SÓ VÊ O QUE PODE ENTRAR ===');
check('a lista filtra por tipo inscricao e status aberto',
    /tipo:\s*'inscricao',\s*status:\s*'aberto'/.test(fonteRun));

console.log(falhas === 0
    ? '\n*** TODOS OS TESTES DE EVENTO PASSARAM ***'
    : `\n!!! ${falhas} TESTE(S) DE EVENTO FALHARAM !!!`);

process.exit(falhas === 0 ? 0 : 1);
