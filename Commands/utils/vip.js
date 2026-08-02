/**
 * Planos VIP e cosméticos.
 *
 * REGRA DE OURO DESTE ARQUIVO: nada aqui pode dar vantagem de combate.
 *
 * Nenhuma vantagem altera ATA/LIF/POW, chance de raridade no /roll, ou o
 * resultado de uma batalha. O que se vende é aparência (molduras, cores,
 * emblemas) e conveniência (cooldown menor, daily melhor). Isso é
 * proposital: bot de carta que vende poder esvazia a base gratuita, que é
 * justamente quem faz o bot crescer — e, no caso do AniBattle, moeda
 * comprada que virasse poder em batalha com aposta traria um problema
 * bem maior que pay-to-win.
 *
 * A única vantagem que encosta na economia é a redução de cooldown do
 * /roll, porque rolar mais gera mais moeda. Por isso ela é modesta e
 * limitada — ver ROLL_COOLDOWN_MULTIPLIER de cada plano.
 */

const TIERS = {
    bronze: {
        key: 'bronze',
        nome: 'Bronze',
        emoji: '🥉',
        cor: 0xCD7F32,
        precoBRL: 5,
        ordem: 1,
        rollCooldownMultiplier: 0.90,  // -10%
        dailyMultiplier: 1.25,
        molduras: ['bronze'],
        podeCorPerfil: true,
        podeBanner: false,
        destaqueRanking: false
    },
    prata: {
        key: 'prata',
        nome: 'Prata',
        emoji: '🥈',
        cor: 0xC0C0C0,
        precoBRL: 15,
        ordem: 2,
        rollCooldownMultiplier: 0.80,  // -20%
        dailyMultiplier: 1.5,
        molduras: ['bronze', 'prata'],
        podeCorPerfil: true,
        podeBanner: true,
        destaqueRanking: false
    },
    ouro: {
        key: 'ouro',
        nome: 'Ouro',
        emoji: '🥇',
        cor: 0xFFD700,
        precoBRL: 30,
        ordem: 3,
        rollCooldownMultiplier: 0.70,  // -30%
        dailyMultiplier: 2,
        molduras: ['bronze', 'prata', 'ouro', 'sakura'],
        podeCorPerfil: true,
        podeBanner: true,
        destaqueRanking: true
    },
    master: {
        key: 'master',
        nome: 'Master',
        emoji: '🌟',
        cor: 0xE91E63,
        precoBRL: 50,
        ordem: 4,
        rollCooldownMultiplier: 0.60,  // -40%
        dailyMultiplier: 3,
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
    nenhuma: { key: 'nenhuma', nome: 'Padrão', descricao: 'A moldura normal da raridade.' },
    bronze: { key: 'bronze', nome: 'Bronze', descricao: 'Borda dupla em tom bronze.', cores: ['#CD7F32', '#8B5A2B'] },
    prata: { key: 'prata', nome: 'Prata', descricao: 'Borda dupla prateada com brilho.', cores: ['#E8E8E8', '#9E9E9E'] },
    ouro: { key: 'ouro', nome: 'Ouro', descricao: 'Borda dourada com cantos ornamentados.', cores: ['#FFD700', '#B8860B'] },
    sakura: { key: 'sakura', nome: 'Sakura', descricao: 'Pétalas de cerejeira nos cantos.', cores: ['#FFB7C5', '#FF69B4'] },
    holografica: { key: 'holografica', nome: 'Holográfica', descricao: 'Faixa iridescente que atravessa a carta.', cores: ['#FF00CC', '#00E5FF'] },
    neon: { key: 'neon', nome: 'Neon', descricao: 'Contorno neon pulsante.', cores: ['#39FF14', '#00E5FF'] }
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
 */
function getPerks(user) {
    const tier = getTier(user);
    if (!tier) {
        return {
            vip: false,
            tier: null,
            rollCooldownMultiplier: 1,
            dailyMultiplier: 1,
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
        dailyMultiplier: tier.dailyMultiplier,
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

module.exports = {
    TIERS,
    ORDEM_TIERS,
    MOLDURAS,
    isVipAtivo,
    getTier,
    getPerks,
    badge,
    molduraEfetiva,
    corPerfilEfetiva,
    calcularExpiracao
};
