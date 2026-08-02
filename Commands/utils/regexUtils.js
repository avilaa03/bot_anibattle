/**
 * Escapa caracteres especiais de regex em uma string vinda de input do usuário,
 * para que ela possa ser usada com segurança dentro de um `new RegExp(...)`
 * (evita queries de regex inválidas/custosas a partir de texto arbitrário).
 */
function escapeRegex(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
