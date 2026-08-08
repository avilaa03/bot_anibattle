/**
 * Testes das regras de aviso de conquista.
 *
 * O que importa: troféu raro precisa ser público (é o que dá vontade de
 * perseguir), troféu comum precisa ser privado (senão vira spam), e nada
 * disso pode quebrar se o canvas não estiver disponível.
 */

const path = require('path');
const UTILS = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

// O canvas é binário nativo e pode não existir no ambiente de teste.
// Stubamos para conseguir testar as regras de visibilidade.
let canvasDisponivel = true;
try { require('canvas'); } catch (e) { canvasDisponivel = false; }

const achievements = require(UTILS + 'achievements.js');
const notif = require(UTILS + 'notificacoes.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

console.log('=== Quem é público e quem é privado ===');
const porTipo = (tipo) => achievements.todas().find((c) => c.tipo === tipo);

check('bronze é privado', !notif.ehPublica(porTipo('bronze')));
check('prata é privado', !notif.ehPublica(porTipo('prata')));
check('ouro é PÚBLICO', notif.ehPublica(porTipo('ouro')));
check('platina é PÚBLICO', notif.ehPublica(achievements.PLATINA));

const publicos = achievements.todas().filter(notif.ehPublica);
const privados = achievements.todas().filter((c) => !notif.ehPublica(c));
check('a maioria é privada (não vira spam)', privados.length > publicos.length,
    `(${privados.length} privados vs ${publicos.length} públicos)`);

console.log('\n=== Embeds ===');
const bronze = porTipo('bronze');
// Nome e descrição não vivem mais no catálogo — vêm do dicionário pela
// chave do troféu, então o teste compara com o texto já localizado.
const bronzePt = achievements.localizar(bronze, 'pt-BR');
const e1 = notif.embedConquista(bronze);
check('embed tem o nome do troféu', e1.data.title.includes(bronzePt.nome));
check('embed tem a descrição', e1.data.description.includes(bronzePt.descricao));
check('embed usa a cor do tipo', e1.data.color === achievements.TIPOS.bronze.cor);
check('sem imagem por padrão', !e1.data.image);
check('com imagem quando pedido', Boolean(notif.embedConquista(bronze, true).data.image));

const anuncio = notif.embedAnuncio(achievements.PLATINA, '123456789');
check('anúncio de platina menciona o jogador', anuncio.data.description.includes('<@123456789>'));
check('anúncio de platina tem destaque', anuncio.data.title.includes('PLATINA'));
check('anúncio de ouro é diferente do de platina',
    notif.embedAnuncio(porTipo('ouro'), '1').data.title !== anuncio.data.title);

console.log('\n=== Imagem do troféu ===');
if (!canvasDisponivel) {
    console.log('  ·    canvas indisponível neste ambiente — testando só o fallback');
    check('imagemTrofeu devolve null sem quebrar', notif.imagemTrofeu(bronze) === null);
} else {
    const { buildTrophy, W, H } = require(UTILS + 'trophyBuilder.js');
    let tamanhos = [];
    for (const tipo of ['bronze', 'prata', 'ouro', 'platina']) {
        const c = achievements.todas().find((x) => x.tipo === tipo);
        const buffer = buildTrophy(c, achievements.TIPOS[tipo]);
        tamanhos.push({ tipo, bytes: buffer.length });
        check(`gera PNG de ${tipo}`, Buffer.isBuffer(buffer) && buffer.length > 1000,
            `(${(buffer.length / 1024).toFixed(0)} KB)`);
    }
    check('dimensões configuradas', W === 700 && H === 220, `(${W}x${H})`);
    check('todas as imagens abaixo de 1 MB', tamanhos.every((t) => t.bytes < 1024 * 1024));
    check('anexo tem nome de arquivo', notif.imagemTrofeu(bronze)?.name === 'trofeu.png');
}

console.log('\n=== Nome com acento e texto longo não quebram ===');
const extremo = {
    chave: 'teste',
    nome: 'Coleção Épica de Ão Çedilha Ínclita',
    descricao: 'Uma descrição bem longa para testar se o ajuste de fonte funciona sem estourar a largura do banner inteiro.',
    tipo: 'ouro'
};
if (canvasDisponivel) {
    const { buildTrophy } = require(UTILS + 'trophyBuilder.js');
    let quebrou = false;
    try { buildTrophy(extremo, achievements.TIPOS.ouro); } catch (e) { quebrou = true; }
    check('texto extremo não quebra a renderização', !quebrou);
} else {
    check('(pulado — sem canvas)', true);
}

console.log('\n=== Todos os tipos têm estilo definido ===');
const src = require('fs').readFileSync(UTILS + 'trophyBuilder.js', 'utf8');
const semEstilo = Object.keys(achievements.TIPOS).filter((t) => !new RegExp(`\\b${t}:\\s*\\{`).test(src));
check('nenhum tipo de troféu sem estilo visual', semEstilo.length === 0,
    semEstilo.length ? `-> ${semEstilo.join(', ')}` : '');

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE NOTIFICAÇÃO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
