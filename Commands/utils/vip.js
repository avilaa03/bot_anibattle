/**
 * Planos VIP e cosméticos.
 *
 * REGRA DE OURO DESTE ARQUIVO: nada aqui pode dar vantagem de combate.
 *
 * Nenhuma vantagem altera ATA/LIF/POW, chance de raridade no /roll, ou o
 * resultado de uma batalha. Isso é proposital: bot de carta que vende
 * poder esvazia a base gratuita, que é justamente quem faz o bot crescer —
 * e, no caso do AniBattle, moeda comprada que virasse poder em batalha
 * com aposta traria um problema bem maior que pay-to-win.
 *
 * ## Os três eixos que um plano PODE acelerar
 *
 * **Quantidade** — quantas vezes o jogador age por dia. Cooldown menor,
 * cargas acumuladas, roll extra no diário. É o eixo mais rentável e o
 * menos contestado, porque é *visível e verificável*: o assinante joga
 * mais, não tem sorte melhor. É o mesmo eixo que o Mudae vende.
 *
 * **Conveniência** — quanto atrito o jogador paga para fazer o que já
 * faria. Taxa de mercado menor, venda rápida melhor, lista de desejos
 * maior. Não cria carta nem poder: reduz pedágio.
 *
 * **Cosmético** — molduras, cor, banner, emblema, destaque. Margem
 * infinita e risco zero de desequilíbrio.
 *
 * ## O que continua fora, e por quê
 *
 * Chance de raridade não se compra. Está escrito em `rollRun.js` que "o
 * sorteio é igual para todo mundo", e é o argumento mais forte que o bot
 * tem contra os concorrentes pay-to-win — odds compradas é exatamente o
 * que faz jogador acusar bot de ser rigged.
 *
 * ## Os dois freios que sobraram na economia
 *
 * Cooldown e bônus de venda rápida encostam na economia, porque rolar
 * mais e vender melhor geram moeda. Por isso os dois são limitados e
 * travados por teste: o cooldown não passa de -45% (ver
 * `LIMITE_COOLDOWN`) e a venda rápida não passa de +20%.
 *
 * Repare que a taxa de mercado zerada do Master vai na direção contrária:
 * ela REMOVE um sink. É aceitável porque assinante é minoria, mas se a
 * inflação apertar, este é o primeiro lugar a revisar — não a taxa de
 * quem joga de graça.
 */

const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * O piso do multiplicador de cooldown — ou seja, o desconto máximo que
 * qualquer plano pode dar no `/roll`.
 *
 * Existe como constante, e não como número solto no plano mais caro,
 * porque é ele que o teste trava. Mexer aqui é uma decisão de economia
 * (mais rolls = mais moeda entrando no jogo), não um ajuste de preço.
 */
const LIMITE_COOLDOWN = 0.55;   // -45%

/** O bônus máximo de venda rápida. Mesmo motivo: é torneira de moeda. */
const LIMITE_BONUS_VENDA = 1.20;  // +20%

/** Lista de desejos de quem não assina. O VIP multiplica isso. */
const LIMITE_DESEJOS_GRATIS = 10;

const TIERS = {
    bronze: {
        key: 'bronze',
        emoji: '🥉',
        cor: 0xCD7F32,
        precoBRL: 5,
        ordem: 1,
        // --- Quantidade ---
        rollCooldownMultiplier: 0.85,  // -15%
        cargasExtras: 1,
        dailyMultiplier: 1.5,
        rollExtraDiario: 0,
        // --- Conveniência ---
        taxaMercadoMultiplier: 0.8,    // 5% -> 4%
        bonusVendaRapida: 1.05,        // +5%
        limiteDesejos: 25,
        // --- Cosmético ---
        molduras: ['bronze'],
        podeCorPerfil: true,
        podeBanner: false,
        destaqueRanking: false
    },
    prata: {
        key: 'prata',
        emoji: '🥈',
        cor: 0xC0C0C0,
        precoBRL: 15,
        ordem: 2,
        rollCooldownMultiplier: 0.75,  // -25%
        cargasExtras: 1,
        dailyMultiplier: 2,
        rollExtraDiario: 1,
        taxaMercadoMultiplier: 0.6,    // 5% -> 3%
        bonusVendaRapida: 1.10,        // +10%
        limiteDesejos: 40,
        molduras: ['bronze', 'prata'],
        podeCorPerfil: true,
        podeBanner: true,
        destaqueRanking: false
    },
    ouro: {
        key: 'ouro',
        emoji: '🥇',
        cor: 0xFFD700,
        precoBRL: 30,
        ordem: 3,
        rollCooldownMultiplier: 0.65,  // -35%
        cargasExtras: 2,
        dailyMultiplier: 2.5,
        rollExtraDiario: 2,
        taxaMercadoMultiplier: 0.3,    // 5% -> 1,5%
        bonusVendaRapida: 1.15,        // +15%
        limiteDesejos: 60,
        molduras: ['bronze', 'prata', 'ouro', 'sakura'],
        podeCorPerfil: true,
        podeBanner: true,
        destaqueRanking: true
    },
    master: {
        key: 'master',
        emoji: '🌟',
        cor: 0xE91E63,
        precoBRL: 50,
        ordem: 4,
        rollCooldownMultiplier: LIMITE_COOLDOWN,  // -45%
        cargasExtras: 3,
        dailyMultiplier: 3,
        rollExtraDiario: 3,
        taxaMercadoMultiplier: 0,      // isento
        bonusVendaRapida: LIMITE_BONUS_VENDA,     // +20%
        limiteDesejos: 100,
        molduras: ['bronze', 'prata', 'ouro', 'sakura', 'holografica', 'neon'],
        podeCorPerfil: true,
        podeBanner: true,
        destaqueRanking: true
    }
};

const ORDEM_TIERS = ['bronze', 'prata', 'ouro', 'master'];

/**
 * Catálogo de molduras. São puramente visuais — desenhadas por cima da
 * carta no cardBuilder, sem tocar em atributo nenhum.
 */
const MOLDURAS = {
    nenhuma: { key: 'nenhuma' },
    bronze: { key: 'bronze', cores: ['#CD7F32', '#8B5A2B'] },
    prata: { key: 'prata', cores: ['#E8E8E8', '#9E9E9E'] },
    ouro: { key: 'ouro', cores: ['#FFD700', '#B8860B'] },
    sakura: { key: 'sakura', cores: ['#FFB7C5', '#FF69B4'] },
    holografica: { key: 'holografica', cores: ['#FF00CC', '#00E5FF'] },
    neon: { key: 'neon', cores: ['#39FF14', '#00E5FF'] }
};

/** O VIP do usuário está ativo agora? */
function isVipAtivo(user) {
    if (!user?.vip?.tier) return false;
    if (!TIERS[user.vip.tier]) return false;
    // expiresAt nulo = vitalício
    if (!user.vip.expiresAt) return true;
    return new Date(user.vip.expiresAt).getTime() > Date.now();
}

/** Configuração do plano ativo, ou null se não houver. */
function getTier(user) {
    if (!isVipAtivo(user)) return null;
    return TIERS[user.vip.tier] || null;
}

/**
 * Vantagens efetivas do usuário. Sempre devolve valores utilizáveis,
 * mesmo para quem não é VIP (multiplicadores neutros).
 *
 * ## Por que os neutros importam tanto
 *
 * Quem chama nunca deve precisar perguntar "é VIP?" antes de multiplicar.
 * `getPerks(null).bonusVendaRapida` é 1, `taxaMercadoMultiplier` é 1,
 * `rollExtraDiario` é 0 — então o caminho do jogador grátis e o do
 * assinante são o MESMO código, e não dois que precisam concordar.
 *
 * Foi assim que o cooldown nunca teve bug de VIP: `rollRun` só multiplica.
 */
function getPerks(user) {
    const tier = getTier(user);
    if (!tier) {
        return {
            vip: false,
            tier: null,
            rollCooldownMultiplier: 1,
            cargasExtras: 0,
            dailyMultiplier: 1,
            rollExtraDiario: 0,
            taxaMercadoMultiplier: 1,
            bonusVendaRapida: 1,
            limiteDesejos: LIMITE_DESEJOS_GRATIS,
            moldurasDisponiveis: ['nenhuma'],
            podeCorPerfil: false,
            podeBanner: false,
            destaqueRanking: false
        };
    }
    return {
        vip: true,
        tier,
        rollCooldownMultiplier: tier.rollCooldownMultiplier,
        // Quantidade, nunca sorte: o assinante ACUMULA mais rolls não
        // usados, e continua com exatamente a mesma chance de raridade.
        cargasExtras: tier.cargasExtras || 0,
        dailyMultiplier: tier.dailyMultiplier,
        // Bilhetes de roll extra entregues junto com o /daily. É o eixo de
        // quantidade mais direto que existe — e passa pelo item que já
        // existe na bolsa, então não abre caminho novo para carta entrar.
        rollExtraDiario: tier.rollExtraDiario || 0,
        taxaMercadoMultiplier: tier.taxaMercadoMultiplier ?? 1,
        bonusVendaRapida: tier.bonusVendaRapida ?? 1,
        limiteDesejos: tier.limiteDesejos || LIMITE_DESEJOS_GRATIS,
        moldurasDisponiveis: ['nenhuma', ...tier.molduras],
        podeCorPerfil: tier.podeCorPerfil,
        podeBanner: tier.podeBanner,
        destaqueRanking: tier.destaqueRanking
    };
}

/** Emblema para exibir ao lado do nome (vazio se não for VIP). */
function badge(user) {
    const tier = getTier(user);
    return tier ? tier.emoji : '';
}

/**
 * A moldura que deve ser usada ao desenhar a carta.
 * Se o VIP expirou, cai para a padrão automaticamente — o jogador não
 * perde a configuração, ela só deixa de ser aplicada.
 */
function molduraEfetiva(user) {
    const perks = getPerks(user);
    const escolhida = user?.cosmetics?.moldura || 'nenhuma';
    return perks.moldurasDisponiveis.includes(escolhida) ? escolhida : 'nenhuma';
}

/** Cor de perfil efetiva (null = usa a cor padrão do embed). */
function corPerfilEfetiva(user) {
    const perks = getPerks(user);
    if (!perks.podeCorPerfil) return null;
    const cor = user?.cosmetics?.corPerfil;
    return typeof cor === 'number' ? cor : null;
}

/** Data de expiração somando `meses` ao que o usuário já tem. */
function calcularExpiracao(user, meses = 1) {
    const agora = Date.now();
    const atual = isVipAtivo(user) && user.vip.expiresAt
        ? new Date(user.vip.expiresAt).getTime()
        : agora;
    // Renovar antes de expirar acumula o tempo restante em vez de perdê-lo.
    const base = Math.max(agora, atual);
    return new Date(base + meses * 30 * 24 * 60 * 60 * 1000);
}

/** Nome do plano no idioma pedido ("Prata" / "Silver"). */
function nomeTier(key, locale = DEFAULT_LOCALE) {
    return traduzir(locale, `vip_catalogo.tiers.${key}`);
}

/** Moldura com nome e descrição no idioma pedido. */
function localizarMoldura(key, locale = DEFAULT_LOCALE) {
    const base = MOLDURAS[key] || MOLDURAS.nenhuma;
    return {
        ...base,
        nome: traduzir(locale, `vip_catalogo.molduras.${base.key}.nome`),
        descricao: traduzir(locale, `vip_catalogo.molduras.${base.key}.descricao`)
    };
}

/** Plano com `nome` já traduzido. */
function localizarTier(tier, locale = DEFAULT_LOCALE) {
    if (!tier) return null;
    return { ...tier, nome: nomeTier(tier.key, locale) };
}

module.exports = {
    nomeTier,
    localizarTier,
    localizarMoldura,
    TIERS,
    ORDEM_TIERS,
    MOLDURAS,
    LIMITE_COOLDOWN,
    LIMITE_BONUS_VENDA,
    LIMITE_DESEJOS_GRATIS,
    isVipAtivo,
    getTier,
    getPerks,
    badge,
    molduraEfetiva,
    corPerfilEfetiva,
    calcularExpiracao
};
