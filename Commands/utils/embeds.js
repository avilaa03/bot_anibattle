const { EmbedBuilder } = require('discord.js');
const { traduzir, normalizar, DEFAULT_LOCALE } = require('./i18n');

/**
 * Identidade visual compartilhada por todas as respostas do bot.
 *
 * A ideia é que nenhum comando monte cor, emoji ou rótulo de raridade na
 * mão — tudo sai daqui, então mudar a cara do bot é mexer em um arquivo só
 * e todos os comandos acompanham.
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
    master: { emoji: '🌟', color: 0xFFD700, weight: 4 },
    // Evento fica ACIMA da Mestra no peso porque ela é a mais exclusiva
    // do jogo: não sai de roll nem de caixa, só de distribuição direta.
    // O peso ordena inventário, mercado e escolha de time.
    event: { emoji: '🎗️', color: 0x00E5A0, weight: 5 }
};

const STATUS_COLORS = {
    error: 0xE53935,
    success: 0x4CAF50,
    warning: 0xFF9800,
    info: 0x5865F2,
    neutral: 0x9E9E9E
};

// Como cada idioma formata número. O separador de milhar muda (1.234 x
// 1,234) e é a diferença mais visível entre as versões. O espanhol
// acompanha o português no ponto.
const LOCALE_NUMERO = { 'pt-BR': 'pt-BR', 'en-US': 'en-US', 'es-ES': 'es-ES' };

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
    return { ...meta, label: traduzir(locale, 'raridades.' + key.replace(/ /g, '_')) };
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

/** 12345 -> "12.345 🪙" */
function coins(amount, locale = DEFAULT_LOCALE) {
    const value = Number(amount) || 0;
    return `**${value.toLocaleString(LOCALE_NUMERO[normalizar(locale)])}** ${COIN_FALLBACK}`;
}

/** Só o número formatado, sem emoji nem negrito. */
function number(amount, locale = DEFAULT_LOCALE) {
    return (Number(amount) || 0).toLocaleString(LOCALE_NUMERO[normalizar(locale)]);
}

/**
 * Uma fração (0,015) como porcentagem legível ("1,5"), SEM o sinal de %.
 *
 * O `%` fica no dicionário junto da frase, porque a posição dele muda de
 * idioma para idioma e a frase inteira precisa poder ser reescrita.
 *
 * ## Por que não é só Math.round(x * 100)
 *
 * Era, enquanto a taxa do mercado era 5% para todo mundo. Com a taxa
 * reduzida do VIP existe 1,5%, e o arredondamento cego mostraria "2%" —
 * um número que o jogador não consegue conferir com a conta que ele vê
 * na tela, e que faz o suporte receber print de "cobrou errado".
 *
 * Casas decimais só aparecem quando existem: 5% não vira "5,0%".
 */
function percent(fracao, locale = DEFAULT_LOCALE, casas = 1) {
    const valor = (Number(fracao) || 0) * 100;
    return valor.toLocaleString(LOCALE_NUMERO[normalizar(locale)], {
        minimumFractionDigits: 0,
        maximumFractionDigits: casas
    });
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

/**
 * O nome da carta como ele deve aparecer em QUALQUER tela.
 *
 * `Sasuke Uchiha` quando natural, `Sasuke Uchiha (+3)` quando aprimorada.
 *
 * ## Por que o nível entra aqui e não em cada tela
 *
 * O selo precisa aparecer em tudo: inventário, mercado, anúncio, batalha,
 * troca, torneio, perfil. São mais de trinta pontos, e pendurar o nível em
 * cada um deles é garantir que alguém esqueça de um — foi exatamente
 * assim que o overall reconstruído por `marketValue / 10` sobreviveu em
 * doze arquivos.
 *
 * Como todo mundo já passava por aqui para capitalizar o nome, este é o
 * único lugar que precisa saber a regra.
 *
 * @param {object|string} carta a carta inteira (preferido) ou só o nome
 * @param {number} [nivel] só quando o nome vem solto, sem a carta junto
 * @param {string} [locale] idioma do texto de reserva
 *
 * ATENÇÃO: o primeiro argumento é a CARTA INTEIRA, não `carta.name`.
 * Passar só o nome funciona, mas perde o `(+3)` — e perde em silêncio.
 */
function cardName(carta, nivel, locale = DEFAULT_LOCALE) {
    const ehObjeto = carta !== null && typeof carta === 'object';
    const nome = ehObjeto ? (carta.name ?? carta.cardName) : carta;
    const n = nivel ?? (ehObjeto ? carta.nivel : 0);

    const texto = String(nome || traduzir(locale, 'comum.carta')).trim();
    const capitalizado = texto.charAt(0).toUpperCase() + texto.slice(1);

    const grau = Math.max(0, Math.floor(Number(n) || 0));
    return grau > 0 ? `${capitalizado} (+${grau})` : capitalizado;
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

/** Formata um tempo restante em ms para "12 min 30 s". */
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
    percent,
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
