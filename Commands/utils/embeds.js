const { EmbedBuilder } = require('discord.js');
const { traduzir, normalizar, DEFAULT_LOCALE } = require('./i18n');

/**
 * Identidade visual compartilhada por todas as respostas do bot.
 *
 * A ideia é que nenhum comando monte cor, emoji ou rótulo de raridade na
 * mão — tudo sai daqui, então mudar a cara do bot é mexer em um arquivo só
 * e todos os comandos acompanham.
 *
 * Tudo que vira texto (rótulo de raridade, número, duração) recebe o
 * `locale` como último argumento. Ele é opcional e cai em português
 * quando não vem — nenhuma chamada antiga quebra, mas toda chamada nova
 * deve passar o idioma resolvido da interação.
 */

const BRAND = 'AniBattle';
const COIN = '<:coin:0>'; // trocar por um emoji custom do servidor, se tiver
const COIN_FALLBACK = '🪙';

// Raridades: como estão salvas no banco (chave, minúscula) x como devem
// ser mostradas para o jogador. Emoji, cor e peso não mudam com o idioma;
// só o rótulo, que vem do dicionário.
const RARITIES = {
    common: { emoji: '⚪', color: 0x9E9E9E, weight: 0 },
    rare: { emoji: '🔵', color: 0x2196F3, weight: 1 },
    'ultra rare': { emoji: '🟣', color: 0xAB47BC, weight: 2 },
    legendary: { emoji: '🟠', color: 0xFF9800, weight: 3 },
    master: { emoji: '🌟', color: 0xFFD700, weight: 4 }
};

const STATUS_COLORS = {
    error: 0xE53935,
    success: 0x4CAF50,
    warning: 0xFF9800,
    info: 0x5865F2,
    neutral: 0x9E9E9E
};

// Como cada idioma formata número. O separador de milhar muda (1.234 x
// 1,234) e é a diferença mais visível entre as duas versões.
const LOCALE_NUMERO = {
    'pt-BR': 'pt-BR',
    'en-US': 'en-US'
};

function getRarity(rarity, locale = DEFAULT_LOCALE) {
    const key = String(rarity || 'common').toLowerCase().trim();
    const meta = RARITIES[key];
    if (!meta) {
        return {
            label: rarity || traduzir(locale, 'raridades.desconhecida'),
            emoji: '⚪',
            color: STATUS_COLORS.neutral,
            weight: -1
        };
    }
    return { ...meta, label: traduzir(locale, `raridades.${key.replace(/ /g, '_')}`) };
}

/** "Ultra Rara" com o emoji na frente — o jeito padrão de mostrar raridade. */
function rarityTag(rarity, locale = DEFAULT_LOCALE) {
    const meta = getRarity(rarity, locale);
    return `${meta.emoji} **${meta.label}**`;
}

function rarityColor(rarity) {
    return getRarity(rarity).color;
}

/** Ordena da raridade mais alta para a mais baixa. */
function compareRarityDesc(a, b) {
    return getRarity(b).weight - getRarity(a).weight;
}

/** 12345 -> "12.345 🪙" em pt-BR, "12,345 🪙" em en-US */
function coins(amount, locale = DEFAULT_LOCALE) {
    const value = Number(amount) || 0;
    return `**${value.toLocaleString(LOCALE_NUMERO[normalizar(locale)])}** ${COIN_FALLBACK}`;
}

/** Só o número formatado, sem emoji nem negrito. */
function number(amount, locale = DEFAULT_LOCALE) {
    return (Number(amount) || 0).toLocaleString(LOCALE_NUMERO[normalizar(locale)]);
}

/**
 * Barra de progresso em blocos, para atributos.
 * progressBar(71, 100) -> "▰▰▰▰▰▰▰▱▱▱"
 */
function progressBar(value, max = 100, size = 10) {
    const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / (max || 1)));
    const filled = Math.round(ratio * size);
    return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

/**
 * Linha de atributos pronta para embed: ATA/LIF/POW com barras.
 *
 * As siglas são traduzidas (ATA/LIF/POW -> ATK/HP/PWR) porque aparecem
 * na carta e no embed o tempo todo — deixá-las em português seria a
 * primeira coisa a denunciar que a tradução é parcial.
 */
function statLines(card, locale = DEFAULT_LOCALE) {
    const ata = card.ATA ?? 0;
    const lif = card.LIF ?? 0;
    const pow = card.POW ?? 0;
    return [
        `⚔️ \`${traduzir(locale, 'atributos.ata')}\` ${progressBar(ata, 100)} **${ata}**`,
        `❤️ \`${traduzir(locale, 'atributos.lif')}\` ${progressBar(lif, 250)} **${lif}**`,
        `💥 \`${traduzir(locale, 'atributos.pow')}\` ${progressBar(pow, 100)} **${pow}**`
    ].join('\n');
}

/** Nome com a primeira letra maiúscula, sem quebrar nomes já formatados. */
function cardName(name, locale = DEFAULT_LOCALE) {
    const text = String(name || traduzir(locale, 'comum.carta')).trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Base de todo embed do bot: rodapé e timestamp padronizados. */
function base(color = STATUS_COLORS.info) {
    return new EmbedBuilder()
        .setColor(color)
        .setFooter({ text: BRAND })
        .setTimestamp();
}

function error(title, description) {
    return base(STATUS_COLORS.error)
        .setTitle(`❌ ${title}`)
        .setDescription(description);
}

function success(title, description) {
    return base(STATUS_COLORS.success)
        .setTitle(`✅ ${title}`)
        .setDescription(description);
}

function warning(title, description) {
    return base(STATUS_COLORS.warning)
        .setTitle(`⚠️ ${title}`)
        .setDescription(description);
}

function info(title, description) {
    return base(STATUS_COLORS.info)
        .setTitle(title)
        .setDescription(description);
}

function neutral(title, description) {
    return base(STATUS_COLORS.neutral)
        .setTitle(title)
        .setDescription(description);
}

/** Medalha de posição em rankings. */
function medal(index) {
    return ['🥇', '🥈', '🥉'][index] || `\`#${index + 1}\``;
}

/** Formata um tempo restante em ms para "12 min 30 s" / "12m 30s". */
function duration(ms, locale = DEFAULT_LOCALE) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}${traduzir(locale, 'tempo.h')}`);
    if (minutes > 0) parts.push(`${minutes}${traduzir(locale, 'tempo.min')}`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}${traduzir(locale, 'tempo.s')}`);
    return parts.join(' ');
}

module.exports = {
    BRAND,
    COIN,
    COIN_FALLBACK,
    RARITIES,
    STATUS_COLORS,
    getRarity,
    rarityTag,
    rarityColor,
    compareRarityDesc,
    coins,
    number,
    progressBar,
    statLines,
    cardName,
    base,
    error,
    success,
    warning,
    info,
    neutral,
    medal,
    duration
};
