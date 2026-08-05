const { EmbedBuilder } = require('discord.js');

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
// ser mostradas para o jogador (rótulo em português, emoji e cor).
const RARITIES = {
    common: { label: 'Comum', emoji: '⚪', color: 0x9E9E9E, weight: 0 },
    rare: { label: 'Rara', emoji: '🔵', color: 0x2196F3, weight: 1 },
    'ultra rare': { label: 'Ultra Rara', emoji: '🟣', color: 0xAB47BC, weight: 2 },
    legendary: { label: 'Lendária', emoji: '🟠', color: 0xFF9800, weight: 3 },
    master: { label: 'Mestra', emoji: '🌟', color: 0xFFD700, weight: 4 }
};

const STATUS_COLORS = {
    error: 0xE53935,
    success: 0x4CAF50,
    warning: 0xFF9800,
    info: 0x5865F2,
    neutral: 0x9E9E9E
};

function getRarity(rarity) {
    const key = String(rarity || 'common').toLowerCase().trim();
    return RARITIES[key] || { label: rarity || 'Desconhecida', emoji: '⚪', color: STATUS_COLORS.neutral, weight: -1 };
}

/** "Ultra Rara" com o emoji na frente — o jeito padrão de mostrar raridade. */
function rarityTag(rarity) {
    const meta = getRarity(rarity);
    return `${meta.emoji} **${meta.label}**`;
}

/**
 * O selo de aprimoramento, para colar depois do nome da carta.
 *
 * Vazio no nível 0, para a esmagadora maioria das cartas não ganhar
 * poluição visual.
 *
 * Precisa aparecer em toda tela onde a carta é vista por OUTRA pessoa —
 * mercado, anúncio, batalha. Uma carta +16 tem atributos muito acima da
 * mesma carta natural, e sem o selo o comprador não teria como saber pelo
 * que está pagando.
 */
function nivelTag(nivel) {
    const n = Math.max(0, Math.floor(Number(nivel) || 0));
    return n > 0 ? ` \`+${n}\`` : '';
}

function rarityColor(rarity) {
    return getRarity(rarity).color;
}

/** Ordena da raridade mais alta para a mais baixa. */
function compareRarityDesc(a, b) {
    return getRarity(b).weight - getRarity(a).weight;
}

/** 12345 -> "12.345 🪙" */
function coins(amount) {
    const value = Number(amount) || 0;
    return `**${value.toLocaleString('pt-BR')}** ${COIN_FALLBACK}`;
}

/** Só o número formatado, sem emoji nem negrito. */
function number(amount) {
    return (Number(amount) || 0).toLocaleString('pt-BR');
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

/** Linha de atributos pronta para embed: ATA/LIF/POW com barras. */
function statLines(card) {
    const ata = card.ATA ?? 0;
    const lif = card.LIF ?? 0;
    const pow = card.POW ?? 0;
    return [
        `⚔️ \`ATA\` ${progressBar(ata, 100)} **${ata}**`,
        `❤️ \`LIF\` ${progressBar(lif, 250)} **${lif}**`,
        `💥 \`POW\` ${progressBar(pow, 100)} **${pow}**`
    ].join('\n');
}

/** Nome com a primeira letra maiúscula, sem quebrar nomes já formatados. */
function cardName(name) {
    const text = String(name || 'Carta').trim();
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

/** Formata um tempo restante em ms para "12 min 30 s". */
function duration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours} h`);
    if (minutes > 0) parts.push(`${minutes} min`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds} s`);
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
    nivelTag,
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
