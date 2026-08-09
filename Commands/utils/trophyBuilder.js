const { createCanvas } = require('canvas');
const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * Desenha o troféu como imagem, no estilo do pop-up de troféu da PSN.
 *
 * Um embed de texto comunica a mesma informação, mas não dá a sensação de
 * conquista. A imagem é o que faz a pessoa querer printar e mandar no
 * grupo — e printar é divulgação gratuita.
 *
 * A taça é desenhada por código (sem arquivo de imagem), então não há
 * asset para hospedar nem para quebrar.
 */

const W = 700;
const H = 220;

const ESTILOS = {
    bronze: { principal: '#CD7F32', escuro: '#8B5A2B', claro: '#E8A860', fundo: ['#2A1F14', '#1A130C'], brilho: 10 },
    prata: { principal: '#C0C0C0', escuro: '#8A8A8A', claro: '#F0F0F0', fundo: ['#22262A', '#14171A'], brilho: 14 },
    ouro: { principal: '#FFD700', escuro: '#B8860B', claro: '#FFF3A0', fundo: ['#2E2610', '#1B1608'], brilho: 22 },
    platina: { principal: '#5DADE2', escuro: '#2E86C1', claro: '#D6EAF8', fundo: ['#152530', '#0C161D'], brilho: 30 }
};

const FONT = '"Helvetica Neue", "Arial", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
    const raio = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + raio, y);
    ctx.lineTo(x + w - raio, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + raio);
    ctx.lineTo(x + w, y + h - raio);
    ctx.quadraticCurveTo(x + w, y + h, x + w - raio, y + h);
    ctx.lineTo(x + raio, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - raio);
    ctx.lineTo(x, y + raio);
    ctx.quadraticCurveTo(x, y, x + raio, y);
    ctx.closePath();
}

/** Reduz a fonte até o texto caber. */
function ajustarFonte(ctx, texto, larguraMax, tamanhoInicial, minimo, peso = 'bold') {
    let tamanho = tamanhoInicial;
    ctx.font = `${peso} ${tamanho}px ${FONT}`;
    while (ctx.measureText(texto).width > larguraMax && tamanho > minimo) {
        tamanho -= 2;
        ctx.font = `${peso} ${tamanho}px ${FONT}`;
    }
    return tamanho;
}

/** A taça em si: base, haste, corpo e alças. */
function desenharTaca(ctx, cx, cy, escala, estilo) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(escala, escala);

    const gradiente = ctx.createLinearGradient(-40, -50, 40, 50);
    gradiente.addColorStop(0, estilo.claro);
    gradiente.addColorStop(0.45, estilo.principal);
    gradiente.addColorStop(1, estilo.escuro);

    ctx.shadowColor = estilo.principal;
    ctx.shadowBlur = estilo.brilho;

    // Alças
    ctx.strokeStyle = gradiente;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(-38, -18, 17, Math.PI * 0.55, Math.PI * 1.55, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(38, -18, 17, Math.PI * 1.45, Math.PI * 0.45, false);
    ctx.stroke();

    // Corpo da taça
    ctx.fillStyle = gradiente;
    ctx.beginPath();
    ctx.moveTo(-34, -42);
    ctx.lineTo(34, -42);
    ctx.lineTo(30, -6);
    ctx.quadraticCurveTo(24, 22, 0, 26);
    ctx.quadraticCurveTo(-24, 22, -30, -6);
    ctx.closePath();
    ctx.fill();

    // Haste
    ctx.fillRect(-6, 26, 12, 18);

    // Base
    ctx.beginPath();
    ctx.moveTo(-26, 60);
    ctx.lineTo(26, 60);
    ctx.lineTo(20, 44);
    ctx.lineTo(-20, 44);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Reflexo, para não ficar chapado
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-22, -36);
    ctx.lineTo(-12, -36);
    ctx.quadraticCurveTo(-18, 0, -10, 18);
    ctx.lineTo(-18, 14);
    ctx.quadraticCurveTo(-26, -6, -22, -36);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
}

/** Estrelinhas ao redor, só nos troféus raros. */
function desenharFaiscas(ctx, cx, cy, estilo, quantidade) {
    ctx.save();
    ctx.fillStyle = estilo.claro;
    for (let i = 0; i < quantidade; i++) {
        const angulo = (i / quantidade) * Math.PI * 2 + 0.3;
        const raio = 78 + (i % 3) * 16;
        const x = cx + Math.cos(angulo) * raio;
        const y = cy + Math.sin(angulo) * raio * 0.75;
        const tamanho = 2 + (i % 3);

        ctx.globalAlpha = 0.5 + (i % 3) * 0.15;
        ctx.beginPath();
        // Losango simples lê melhor que estrela nesse tamanho.
        ctx.moveTo(x, y - tamanho * 2);
        ctx.lineTo(x + tamanho, y);
        ctx.lineTo(x, y + tamanho * 2);
        ctx.lineTo(x - tamanho, y);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

/**
 * @param {object} conquista item do catálogo de achievements
 * @param {object} tipo entrada de achievements.TIPOS
 * @returns {Buffer} PNG
 */
/**
 * @param {object} conquista já passada por achievements.localizar()
 * @param {object} tipo entrada de achievements.TIPOS
 * @param {string} [locale] idioma do texto desenhado na imagem
 */
function buildTrophy(conquista, tipo, locale = DEFAULT_LOCALE) {
    const estilo = ESTILOS[conquista.tipo] || ESTILOS.bronze;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Fundo
    ctx.save();
    roundRect(ctx, 0, 0, W, H, 18);
    ctx.clip();

    const fundo = ctx.createLinearGradient(0, 0, W, H);
    fundo.addColorStop(0, estilo.fundo[0]);
    fundo.addColorStop(1, estilo.fundo[1]);
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, W, H);

    // Halo atrás da taça
    const halo = ctx.createRadialGradient(120, H / 2, 10, 120, H / 2, 130);
    halo.addColorStop(0, `${estilo.principal}55`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 260, H);

    // Faixa diagonal discreta, para o fundo não ficar liso
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = estilo.principal;
    for (let x = -H; x < W; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + 22, H);
        ctx.lineTo(x + 22 + H, 0);
        ctx.lineTo(x + H, 0);
        ctx.closePath();
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Faíscas só nos raros — bronze não precisa de festa.
    if (conquista.tipo === 'ouro') desenharFaiscas(ctx, 120, H / 2, estilo, 10);
    if (conquista.tipo === 'platina') desenharFaiscas(ctx, 120, H / 2, estilo, 18);

    desenharTaca(ctx, 120, H / 2 - 6, 1.05, estilo);

    // ---- Texto ----
    const textoX = 250;

    ctx.textAlign = 'left';
    ctx.fillStyle = estilo.principal;
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(traduzir(locale, 'notificacoes.trofeu_desbloqueado').toUpperCase().replace(/!$/, ''), textoX, 58);

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    const tamNome = ajustarFonte(ctx, conquista.nome, W - textoX - 40, 40, 22);
    ctx.font = `bold ${tamNome}px ${FONT}`;
    ctx.fillText(conquista.nome, textoX, 108);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#C8C8C8';
    const tamDesc = ajustarFonte(ctx, conquista.descricao, W - textoX - 40, 19, 13, '500');
    ctx.font = `500 ${tamDesc}px ${FONT}`;
    ctx.fillText(conquista.descricao, textoX, 140);

    // Selo do tipo, canto inferior direito
    const nomeTipo = traduzir(locale, `conquistas.tipos.${tipo.chave || conquista.tipo}`);
    const rotulo = `${nomeTipo.toUpperCase()}  •  +${tipo.pontos} PTS`;
    ctx.font = `bold 14px ${FONT}`;
    const larguraSelo = ctx.measureText(rotulo).width + 28;
    const seloX = W - larguraSelo - 26;
    const seloY = H - 52;

    ctx.save();
    roundRect(ctx, seloX, seloY, larguraSelo, 30, 15);
    ctx.fillStyle = `${estilo.principal}33`;
    ctx.fill();
    ctx.strokeStyle = estilo.principal;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = estilo.claro;
    ctx.textAlign = 'center';
    ctx.fillText(rotulo, seloX + larguraSelo / 2, seloY + 20);

    // Moldura
    ctx.strokeStyle = estilo.principal;
    ctx.lineWidth = 3;
    ctx.shadowColor = estilo.principal;
    ctx.shadowBlur = estilo.brilho * 0.6;
    roundRect(ctx, 2, 2, W - 4, H - 4, 18);
    ctx.stroke();

    return canvas.toBuffer();
}

module.exports = { buildTrophy, W, H };
