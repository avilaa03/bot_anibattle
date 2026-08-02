/**
 * Testes das regras de VIP.
 *
 * O teste mais importante aqui é o último: garantir que nenhum plano
 * devolve algo que altere atributo de carta ou resultado de batalha.
 * Se alguém um dia adicionar uma vantagem de combate por engano, ele quebra.
 */

const path = require('path');
const vip = require(path.join(__dirname, '..', 'Commands', 'utils', 'vip.js'));

let falhas = 0;
function check(nome, cond, extra = '') {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
}

const DIA = 24 * 60 * 60 * 1000;
const usuario = (over = {}) => ({ id: 'u1', vip: { tier: null, expiresAt: null }, cosmetics: {}, ...over });

console.log('=== Status da assinatura ===');
check('sem vip nao é ativo', vip.isVipAtivo(usuario()) === false);
check('usuario nulo nao quebra', vip.isVipAtivo(null) === false);
check('vip futuro é ativo',
    vip.isVipAtivo(usuario({ vip: { tier: 'ouro', expiresAt: new Date(Date.now() + 5 * DIA) } })) === true);
check('vip vencido nao é ativo',
    vip.isVipAtivo(usuario({ vip: { tier: 'ouro', expiresAt: new Date(Date.now() - DIA) } })) === false);
check('expiresAt nulo = vitalicio',
    vip.isVipAtivo(usuario({ vip: { tier: 'master', expiresAt: null } })) === true);
check('tier inexistente nao é ativo',
    vip.isVipAtivo(usuario({ vip: { tier: 'diamante', expiresAt: new Date(Date.now() + DIA) } })) === false);

console.log('\n=== Vantagens escalam com o plano ===');
const perksPorTier = vip.ORDEM_TIERS.map((t) =>
    vip.getPerks(usuario({ vip: { tier: t, expiresAt: new Date(Date.now() + DIA) } })));
const semVip = vip.getPerks(usuario());

check('sem vip tem multiplicadores neutros',
    semVip.rollCooldownMultiplier === 1 && semVip.dailyMultiplier === 1);
check('sem vip so tem moldura padrao',
    semVip.moldurasDisponiveis.length === 1 && semVip.moldurasDisponiveis[0] === 'nenhuma');

let cooldownOk = true, dailyOk = true, molduraOk = true;
for (let i = 1; i < perksPorTier.length; i++) {
    if (!(perksPorTier[i].rollCooldownMultiplier < perksPorTier[i - 1].rollCooldownMultiplier)) cooldownOk = false;
    if (!(perksPorTier[i].dailyMultiplier > perksPorTier[i - 1].dailyMultiplier)) dailyOk = false;
    if (!(perksPorTier[i].moldurasDisponiveis.length >= perksPorTier[i - 1].moldurasDisponiveis.length)) molduraOk = false;
}
check('cooldown diminui a cada plano', cooldownOk);
check('daily aumenta a cada plano', dailyOk);
check('molduras nunca diminuem', molduraOk);
check('reducao de cooldown limitada a 40%',
    Math.min(...perksPorTier.map((p) => p.rollCooldownMultiplier)) >= 0.6,
    `(menor multiplicador = ${Math.min(...perksPorTier.map((p) => p.rollCooldownMultiplier))})`);

console.log('\n=== Precos crescentes ===');
const precos = vip.ORDEM_TIERS.map((t) => vip.TIERS[t].precoBRL);
check('precos sobem junto com o plano',
    precos.every((p, i) => i === 0 || p > precos[i - 1]), `(${precos.join(' < ')})`);

console.log('\n=== Moldura equipada respeita o plano ===');
check('bronze nao usa moldura de master',
    vip.molduraEfetiva(usuario({
        vip: { tier: 'bronze', expiresAt: new Date(Date.now() + DIA) },
        cosmetics: { moldura: 'neon' }
    })) === 'nenhuma');
check('master usa moldura de master',
    vip.molduraEfetiva(usuario({
        vip: { tier: 'master', expiresAt: new Date(Date.now() + DIA) },
        cosmetics: { moldura: 'neon' }
    })) === 'neon');
check('vip vencido cai para a moldura padrao',
    vip.molduraEfetiva(usuario({
        vip: { tier: 'master', expiresAt: new Date(Date.now() - DIA) },
        cosmetics: { moldura: 'neon' }
    })) === 'nenhuma');

console.log('\n=== Cor de perfil ===');
check('sem vip nao aplica cor',
    vip.corPerfilEfetiva(usuario({ cosmetics: { corPerfil: 0xFF0000 } })) === null);
check('vip aplica cor escolhida',
    vip.corPerfilEfetiva(usuario({
        vip: { tier: 'bronze', expiresAt: new Date(Date.now() + DIA) },
        cosmetics: { corPerfil: 0xFF0000 }
    })) === 0xFF0000);

console.log('\n=== Renovacao acumula tempo restante ===');
const faltam10dias = usuario({ vip: { tier: 'ouro', expiresAt: new Date(Date.now() + 10 * DIA) } });
const nova = vip.calcularExpiracao(faltam10dias, 1);
const diasResultantes = Math.round((nova.getTime() - Date.now()) / DIA);
check('renovar com 10 dias restantes da ~40 dias', diasResultantes >= 39 && diasResultantes <= 41, `(${diasResultantes} dias)`);
const doZero = Math.round((vip.calcularExpiracao(usuario(), 1).getTime() - Date.now()) / DIA);
check('assinar do zero da ~30 dias', doZero >= 29 && doZero <= 31, `(${doZero} dias)`);
const vencidoNaoAcumula = Math.round((vip.calcularExpiracao(
    usuario({ vip: { tier: 'ouro', expiresAt: new Date(Date.now() - 100 * DIA) } }), 1).getTime() - Date.now()) / DIA);
check('vip vencido ha muito tempo nao vira credito', vencidoNaoAcumula >= 29 && vencidoNaoAcumula <= 31, `(${vencidoNaoAcumula} dias)`);

console.log('\n=== NENHUM PLANO PODE DAR VANTAGEM DE COMBATE ===');
const CAMPOS_PROIBIDOS = ['ATA', 'LIF', 'POW', 'overall', 'rarity', 'raridade', 'dano', 'critico', 'vitoria', 'battle', 'combate'];
let vazamento = [];
for (const key of vip.ORDEM_TIERS) {
    const tier = vip.TIERS[key];
    for (const campo of Object.keys(tier)) {
        if (CAMPOS_PROIBIDOS.some((p) => campo.toLowerCase().includes(p.toLowerCase()))) {
            vazamento.push(`${key}.${campo}`);
        }
    }
    const perks = vip.getPerks(usuario({ vip: { tier: key, expiresAt: new Date(Date.now() + DIA) } }));
    for (const campo of Object.keys(perks)) {
        if (CAMPOS_PROIBIDOS.some((p) => campo.toLowerCase().includes(p.toLowerCase()))) {
            vazamento.push(`perks.${campo} (${key})`);
        }
    }
}
check('nenhum plano expõe campo de combate', vazamento.length === 0, vazamento.length ? `-> ${vazamento.join(', ')}` : '');

// O motor de combate não pode nem conseguir enxergar o VIP: ele recebe só
// as cartas. Confirmamos que runBattle não importa nada de vip.js.
const fs = require('fs');
const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'Commands', 'utils', 'battleEngine.js'), 'utf8');
check('battleEngine nao importa vip', !engineSrc.includes("require('./vip") && !engineSrc.includes('vip'));

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE VIP PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
