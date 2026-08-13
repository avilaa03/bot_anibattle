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

// Os neutros são o que permite o resto do bot multiplicar sem perguntar
// "é VIP?". Um neutro errado não quebra nada visivelmente: só faz o
// jogador grátis pagar taxa zero, ou receber bônus de venda que não tem.
check('sem vip tem multiplicadores neutros',
    semVip.rollCooldownMultiplier === 1
    && semVip.dailyMultiplier === 1
    && semVip.taxaMercadoMultiplier === 1
    && semVip.bonusVendaRapida === 1);
check('sem vip nao acumula carga nem ganha roll extra',
    semVip.cargasExtras === 0 && semVip.rollExtraDiario === 0);
check('sem vip usa o limite gratis de desejos',
    semVip.limiteDesejos === vip.LIMITE_DESEJOS_GRATIS,
    `(${semVip.limiteDesejos})`);
check('sem vip so tem moldura padrao',
    semVip.moldurasDisponiveis.length === 1 && semVip.moldurasDisponiveis[0] === 'nenhuma');

// Cada eixo precisa MELHORAR (ou pelo menos não piorar) conforme o preço
// sobe. Um plano mais caro que entrega menos numa linha só é o erro mais
// fácil de cometer mexendo em quatro números de uma vez — e o mais caro
// de descobrir, porque quem paga é que percebe.
const monotonico = (campo, comparar) => {
    for (let i = 1; i < perksPorTier.length; i++) {
        if (!comparar(perksPorTier[i][campo], perksPorTier[i - 1][campo])) return false;
    }
    return true;
};
const sobe = (atual, anterior) => atual > anterior;
const naoDesce = (atual, anterior) => atual >= anterior;
const naoSobe = (atual, anterior) => atual <= anterior;

check('cooldown diminui a cada plano', monotonico('rollCooldownMultiplier', (a, b) => a < b));
check('daily aumenta a cada plano', monotonico('dailyMultiplier', sobe));
check('cargas nunca diminuem', monotonico('cargasExtras', naoDesce));
check('roll extra diario nunca diminui', monotonico('rollExtraDiario', naoDesce));
check('taxa de mercado nunca aumenta', monotonico('taxaMercadoMultiplier', naoSobe));
check('bonus de venda rapida nunca diminui', monotonico('bonusVendaRapida', naoDesce));
check('limite de desejos aumenta a cada plano', monotonico('limiteDesejos', sobe));
check('molduras nunca diminuem',
    monotonico('moldurasDisponiveis', (a, b) => a.length >= b.length));

// ---------------------------------------------------------------------
// Os dois tetos que protegem a ECONOMIA (não o combate)
// ---------------------------------------------------------------------
//
// Cooldown menor e venda rápida melhor são as duas vantagens que geram
// moeda. Elas podem existir — é o eixo de quantidade que o plano vende —
// mas o limite é decisão de economia, e decisão de economia não pode ser
// mudada sem alguém reparar. Os números vivem em `vip.js`; aqui a gente
// confere que nenhum plano passou deles.
const menorCooldown = Math.min(...perksPorTier.map((p) => p.rollCooldownMultiplier));
check(`reducao de cooldown limitada a ${Math.round((1 - vip.LIMITE_COOLDOWN) * 100)}%`,
    menorCooldown >= vip.LIMITE_COOLDOWN,
    `(menor multiplicador = ${menorCooldown})`);

const maiorVenda = Math.max(...perksPorTier.map((p) => p.bonusVendaRapida));
check(`bonus de venda rapida limitado a +${Math.round((vip.LIMITE_BONUS_VENDA - 1) * 100)}%`,
    maiorVenda <= vip.LIMITE_BONUS_VENDA,
    `(maior bonus = ${maiorVenda})`);

// A taxa é um SINK: ela destrói moeda. Zerar para o plano mais caro é
// aceitável (assinante é minoria), mas taxa negativa transformaria o
// mercado em torneira — o vendedor receberia mais do que o comprador
// pagou, e a diferença sairia do nada.
check('taxa de mercado nunca fica negativa',
    perksPorTier.every((p) => p.taxaMercadoMultiplier >= 0));

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

// ---------------------------------------------------------------------
// A vantagem CHEGA na economia?
// ---------------------------------------------------------------------
//
// Este é o bug que os testes acima não pegam: o plano promete taxa
// reduzida e bônus de venda, os números estão certos na tabela, e nenhum
// dos dois é aplicado em lugar nenhum. Nada quebra, nada aparece no log —
// o assinante só paga por uma vantagem que não existe, e descobre
// conferindo a conta na mão.
//
// Por isso aqui a gente atravessa a fronteira e chama as funções que os
// comandos chamam de verdade.
console.log('\n=== As vantagens chegam na economia ===');

const economia = require(path.join(__dirname, '..', 'Commands', 'utils', 'economy.js'));
const valores = require(path.join(__dirname, '..', 'Commands', 'utils', 'cardValues.js'));

const vipDe = (tier) => usuario({ vip: { tier, expiresAt: new Date(Date.now() + DIA) } });

const taxaGratis = economia.applyMarketTax(10000, usuario());
const taxaBronze = economia.applyMarketTax(10000, vipDe('bronze'));
const taxaMaster = economia.applyMarketTax(10000, vipDe('master'));

check('sem vip paga a taxa cheia',
    taxaGratis.rate === economia.MARKET_TAX_RATE, `(${taxaGratis.rate})`);
check('bronze paga menos taxa que quem nao assina',
    taxaBronze.tax < taxaGratis.tax, `(${taxaBronze.tax} < ${taxaGratis.tax})`);
check('master nao paga taxa nenhuma',
    taxaMaster.tax === 0 && taxaMaster.sellerReceives === 10000,
    `(recebe ${taxaMaster.sellerReceives} de 10000)`);
check('usuario ausente cai na taxa cheia',
    economia.applyMarketTax(10000, null).rate === economia.MARKET_TAX_RATE);

// A carta é a mesma nos três casos: o que muda é só quem está vendendo.
const cartaDeTeste = { rarity: 'rare', overall: 60, valueToSell: 1000 };
const vendaGratis = valores.vendaRapidaPara(cartaDeTeste, usuario());
const vendaMaster = valores.vendaRapidaPara(cartaDeTeste, vipDe('master'));

check('sem vip a venda rapida paga o valor natural',
    vendaGratis === 1000, `(${vendaGratis})`);
check('master vende melhor que quem nao assina',
    vendaMaster > vendaGratis, `(${vendaMaster} > ${vendaGratis})`);
check('o bonus da venda bate com o do plano',
    vendaMaster === Math.round(1000 * vip.TIERS.master.bonusVendaRapida),
    `(${vendaMaster})`);

// O valor GRAVADO na carta nunca pode carregar o bônus: ele viaja no
// mercado e na troca, e transformaria o plano de quem rolou num aumento
// permanente para todos os donos seguintes.
check('o bonus nao contamina o valor natural da carta',
    valores.valoresDaCarta(cartaDeTeste).valueToSell
        === valores.valorDeVenda('rare', 60));

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
