/**
 * Testes das regras de progressão: conquistas, ELO, streak e missões.
 *
 * Tudo aqui é lógica pura — não precisa de Discord nem de banco.
 */

const path = require('path');
const UTILS = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

const achievements = require(UTILS + 'achievements.js');
const elo = require(UTILS + 'elo.js');
const missoes = require(UTILS + 'missions.js');
const { calcularRecompensa, MARCOS } = require(path.join(__dirname, '..', 'Commands', 'actions', 'run', 'dailyRun.js'));

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

// Contexto zerado, para montar cenários em cima.
const ctx = (over = {}) => ({
    stats: { batalhasVencidas: 0, trocasFeitas: 0, vendasMercado: 0, criticos: 0, viradas: 0, torneiosVencidos: 0, ...(over.stats || {}) },
    balance: 0,
    totalCartas: 0,
    porRaridade: { common: 0, rare: 0, 'ultra rare': 0, legendary: 0, master: 0, ...(over.porRaridade || {}) },
    descobertas: 0,
    totalCatalogo: 1000,
    seriesCompletas: 0,
    streakMaior: 0,
    picoElo: 1000,
    favCard: null,
    ...over
});

console.log('=== Conquistas: regra da platina ===');
check('jogador zerado não tem nada', achievements.avaliar(ctx()).length === 0);

// Cenário que cumpre TUDO.
const tudo = ctx({
    stats: { batalhasVencidas: 100, trocasFeitas: 10, vendasMercado: 1, criticos: 50, viradas: 1, torneiosVencidos: 1 },
    balance: 100000,
    totalCartas: 50,
    porRaridade: { common: 10, rare: 10, 'ultra rare': 10, legendary: 10, master: 10 },
    descobertas: 1000,
    totalCatalogo: 1000,
    seriesCompletas: 3,
    streakMaior: 30,
    picoElo: 1600,
    favCard: 'algo'
});
const todasConquistadas = achievements.avaliar(tudo);
check('cenário completo pega todos os troféus',
    todasConquistadas.length === achievements.CONQUISTAS.length + 1,
    `(${todasConquistadas.length} de ${achievements.CONQUISTAS.length + 1})`);
check('platina incluída', todasConquistadas.includes('platina'));

// Faltando UMA só: platina não pode vir.
const quaseTudo = { ...tudo, stats: { ...tudo.stats, torneiosVencidos: 0 } };
const quase = achievements.avaliar(quaseTudo);
check('faltando 1 troféu, NÃO ganha platina', !quase.includes('platina'),
    `(${quase.length}/${achievements.CONQUISTAS.length} troféus)`);

console.log('\n=== Conquistas: progressão de dificuldade ===');
const bronzes = achievements.CONQUISTAS.filter((c) => c.tipo === 'bronze');
const ouros = achievements.CONQUISTAS.filter((c) => c.tipo === 'ouro');
check('existem troféus de todos os tipos',
    bronzes.length > 0 && ouros.length > 0 && achievements.CONQUISTAS.some((c) => c.tipo === 'prata'));

// Um jogador iniciante deve pegar bronzes, mas nenhum ouro.
const iniciante = ctx({
    totalCartas: 1,
    porRaridade: { common: 1, rare: 1 },
    descobertas: 10,
    balance: 1000,
    streakMaior: 3,
    favCard: 'x',
    stats: { batalhasVencidas: 1, vendasMercado: 1, trocasFeitas: 1 }
});
const doIniciante = achievements.avaliar(iniciante).map((k) => achievements.porChave(k));
check('iniciante pega bronzes', doIniciante.some((c) => c.tipo === 'bronze'));
check('iniciante NÃO pega ouro', !doIniciante.some((c) => c.tipo === 'ouro'));
check('iniciante NÃO pega platina', !doIniciante.some((c) => c.tipo === 'platina'));

console.log('\n=== Conquistas: pontos e nível ===');
check('ouro vale mais que prata que vale mais que bronze',
    achievements.TIPOS.ouro.pontos > achievements.TIPOS.prata.pontos
    && achievements.TIPOS.prata.pontos > achievements.TIPOS.bronze.pontos);
check('platina vale mais que tudo',
    achievements.TIPOS.platina.pontos > achievements.TIPOS.ouro.pontos);
check('nível cresce com os pontos',
    achievements.nivel(achievements.pontos(todasConquistadas)) > achievements.nivel(0));
check('chaves são únicas',
    new Set(achievements.todas().map((c) => c.chave)).size === achievements.todas().length);

console.log('\n=== ELO ===');
const iguais = elo.calcular(1000, 1000);
check('vitória entre iguais move 16 pontos', iguais.ganho === 16, `(+${iguais.ganho})`);
check('perdedor perde o mesmo tanto', iguais.perda === iguais.ganho);

const favorito = elo.calcular(1400, 1000);
const azarao = elo.calcular(1000, 1400);
check('ganhar de quem é bem pior rende pouco', favorito.ganho < 10, `(+${favorito.ganho})`);
check('ganhar de quem é bem melhor rende muito', azarao.ganho > 25, `(+${azarao.ganho})`);
check('não compensa caçar jogador fraco', favorito.ganho < azarao.ganho);

const noPiso = elo.calcular(1000, elo.PISO);
check('quem está no piso não perde mais', noPiso.perdedor >= elo.PISO, `(${noPiso.perdedor})`);

const empate = elo.calcularEmpate(1400, 1000);
check('empate tira do favorito', empate.a < 1400);
check('empate dá para o azarão', empate.b > 1000);

console.log('\n=== ELO: divisões ===');
check('1000 é Bronze', elo.divisao(1000).nome === 'Bronze');
check('1750 é Mestre', elo.divisao(1750).nome === 'Mestre');
check('divisões em ordem crescente',
    elo.DIVISOES.every((d, i) => i === 0 || d.min > elo.DIVISOES[i - 1].min));
check('próxima divisão calcula o que falta', elo.proximaDivisao(1000).faltam === 100,
    `(faltam ${elo.proximaDivisao(1000).faltam})`);
check('na última divisão não há próxima', elo.proximaDivisao(9999) === null);

console.log('\n=== Daily com streak ===');
const d1 = calcularRecompensa(1);
const d5 = calcularRecompensa(5);
const d7 = calcularRecompensa(7);
check('dia 1 dá o valor base', d1 === 200, `(${d1})`);
check('recompensa cresce com a sequência', d5 > d1, `(dia1=${d1} dia5=${d5})`);
check('dia 7 tem bônus de marco', d7 > calcularRecompensa(6) * 2, `(dia6=${calcularRecompensa(6)} dia7=${d7})`);
check('marco de 30 dias existe', Boolean(MARCOS[30]));
check('daily de sequência longa supera o antigo (max 100)', calcularRecompensa(10) > 100, `(${calcularRecompensa(10)})`);

// O bônus para de crescer, mas nunca diminui.
let sempreCrescente = true;
for (let dia = 2; dia <= 60; dia++) {
    if (MARCOS[dia] || MARCOS[dia - 1]) continue;
    if (calcularRecompensa(dia) < calcularRecompensa(dia - 1)) sempreCrescente = false;
}
check('recompensa nunca diminui com o tempo', sempreCrescente);

console.log('\n=== Missões ===');
check('existem missões diárias e semanais',
    missoes.CATALOGO_DIARIAS.length >= 3 && missoes.CATALOGO_SEMANAIS.length >= 2);
check('chaves de missão são únicas',
    new Set([...missoes.CATALOGO_DIARIAS, ...missoes.CATALOGO_SEMANAIS].map((m) => m.chave)).size
    === missoes.CATALOGO_DIARIAS.length + missoes.CATALOGO_SEMANAIS.length);
check('semanais pagam mais que diárias',
    Math.min(...missoes.CATALOGO_SEMANAIS.map((m) => m.recompensa))
    > Math.max(...missoes.CATALOGO_DIARIAS.map((m) => m.recompensa)));

const hoje = missoes.chaveDoDia(new Date('2026-08-02T10:00:00Z'));
check('chave do dia no formato certo', /^\d{4}-\d{2}-\d{2}$/.test(hoje), `(${hoje})`);
const semana = missoes.chaveDaSemana(new Date('2026-08-02T10:00:00Z'));
check('chave da semana no formato certo', /^\d{4}-W\d{2}$/.test(semana), `(${semana})`);
check('dias diferentes = chaves diferentes',
    missoes.chaveDoDia(new Date('2026-08-02')) !== missoes.chaveDoDia(new Date('2026-08-03')));

console.log('\n=== Todo evento de missão é gerado por algum comando ===');
// Se uma missão pede um evento que nada dispara, ela nunca completa.
const EVENTOS_DISPARADOS = ['roll', 'vitoria', 'batalha', 'descoberta', 'venda', 'mercado', 'troca', 'consulta', 'critico', 'diario'];
const orfas = [...missoes.CATALOGO_DIARIAS, ...missoes.CATALOGO_SEMANAIS]
    .filter((m) => !EVENTOS_DISPARADOS.includes(m.evento));
check('nenhuma missão impossível de completar', orfas.length === 0,
    orfas.length ? `-> ${orfas.map((m) => `${m.chave}(${m.evento})`).join(', ')}` : '');

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE PROGRESSÃO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
