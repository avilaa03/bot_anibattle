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
    master: { label: 'Mestra', emoji: '🌟', color: 0xFFD700, weight: 4 },
    // Evento fica ACIMA da Mestra no peso porque ela é a mais exclusiva
    // do jogo: não sai de roll nem de caixa, só de distribuição direta.
    // O peso ordena inventário, mercado e escolha de time.
    event: { label: 'Evento', emoji: '🎗️', color: 0x00E5A0, weight: 5 }
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
 */
function cardName(carta, nivel) {
    const ehObjeto = carta !== null && typeof carta === 'object';
    const nome = ehObjeto ? (carta.name ?? carta.cardName) : carta;
    const n = nivel ?? (ehObjeto ? carta.nivel : 0);

    const texto = String(nome || 'Carta').trim();
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
