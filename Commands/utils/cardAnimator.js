const { createCanvas } = require('canvas');
const CardBuilder = require('./cardBuilder');

/**
 * Gera a versão animada (GIF) de uma carta.
 *
 * A ideia central de performance: a carta é desenhada UMA vez, com arte,
 * texto e moldura de raridade. Depois, cada quadro é só
 * `drawImage(base)` + o efeito animado por cima. Sem isso, animar uma
 * carta custaria N vezes o preço de renderizar uma carta inteira — e a
 * arte do personagem só é baixada uma vez, não por quadro.
 *
 * Como o miolo da carta é idêntico em todos os quadros, o otimizador do
 * encoder consegue comprimir muito bem: só a borda muda de fato.
 */

// Molduras que ganham animação. Bronze e prata continuam fixas de
// propósito — isso cria um degrau claro entre os planos baratos e o Ouro+.
const MOLDURAS_ANIMADAS = new Set(['ouro', 'sakura', 'holografica', 'neon']);

const FRAMES = Number(process.env.CARD_GIF_FRAMES) > 0 ? Number(process.env.CARD_GIF_FRAMES) : 16;
const DELAY_MS = Number(process.env.CARD_GIF_DELAY_MS) > 0 ? Number(process.env.CARD_GIF_DELAY_MS) : 70;

// O GIF é gerado menor que o PNG. O Discord exibe o embed reduzido de
// qualquer forma, e cair de 500x700 para 400x560 corta ~36% dos pixels —
// o que pesa bastante no tamanho final do arquivo.
const GIF_W = Number(process.env.CARD_GIF_WIDTH) > 0 ? Number(process.env.CARD_GIF_WIDTH) : 400;
const GIF_H = Math.round(GIF_W * 1.4);

const PALETA = {
    ouro: ['#FFD700', '#B8860B'],
    sakura: ['#FFB7C5', '#FF69B4'],
    holografica: ['#FF00CC', '#00E5FF'],
    neon: ['#39FF14', '#00E5FF']
};

function ehAnimada(moldura) {
    return MOLDURAS_ANIMADAS.has(moldura);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/** Neon: contorno que pulsa de intensidade. */
function desenharNeon(ctx, t, w, h) {
    const [c1, c2] = PALETA.neon;
    // t vai de 0 a 1; sin dá um pulso suave que fecha o ciclo sem salto.
    const pulso = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const intensidade = 0.55 + 0.45 * pulso;

    ctx.save();
    for (const [cor, blurBase, largura] of [[c2, 26, 8], [c1, 15, 5], ['#FFFFFF', 6, 2]]) {
        ctx.strokeStyle = cor;
        ctx.shadowColor = cor;
        ctx.shadowBlur = blurBase * intensidade;
        ctx.lineWidth = largura * (0.8 + 0.35 * pulso);
        ctx.globalAlpha = intensidade;
        drawRoundedRect(ctx, 6, 6, w - 12, h - 12, 20);
        ctx.stroke();
    }
    ctx.restore();
}

/** Holográfica: faixa iridescente varrendo a carta na diagonal. */
function desenharHolografica(ctx, t, w, h) {
    const [c1, c2] = PALETA.holografica;
    // A faixa percorre de fora a fora, por isso o intervalo vai além de [0,1].
    const pos = -0.6 + t * 2.2;

    ctx.save();
    drawRoundedRect(ctx, 0, 0, w, h, 22);
    ctx.clip();

    const faixa = ctx.createLinearGradient(0, h, w, 0);
    const p = (v) => Math.max(0, Math.min(1, v));
    faixa.addColorStop(p(pos - 0.22), 'rgba(255,255,255,0)');
    faixa.addColorStop(p(pos - 0.10), `${c1}66`);
    faixa.addColorStop(p(pos), 'rgba(255,255,255,0.34)');
    faixa.addColorStop(p(pos + 0.10), `${c2}66`);
    faixa.addColorStop(p(pos + 0.22), 'rgba(255,255,255,0)');
    ctx.fillStyle = faixa;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Borda acompanhando a cor dominante do momento.
    ctx.save();
    const borda = ctx.createLinearGradient(0, 0, w, h);
    borda.addColorStop(0, c1);
    borda.addColorStop(p(0.5 + 0.5 * Math.sin(t * Math.PI * 2)), c2);
    borda.addColorStop(1, c1);
    ctx.strokeStyle = borda;
    ctx.shadowColor = c1;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 6;
    drawRoundedRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.stroke();
    ctx.restore();
}

// Pétalas com posição/velocidade fixas, sorteadas uma vez só para a
// animação ser sempre a mesma e fechar o ciclo certinho.
const PETALAS = Array.from({ length: 14 }, (_, i) => ({
    x: (i * 37 % 100) / 100,
    faseY: (i * 23 % 100) / 100,
    tamanho: 4 + (i % 4),
    deriva: ((i % 5) - 2) * 0.012,
    giro: (i % 3) - 1
}));

/** Sakura: pétalas caindo, com borda rosa. */
function desenharSakura(ctx, t, w, h) {
    const [c1, c2] = PALETA.sakura;

    ctx.save();
    drawRoundedRect(ctx, 0, 0, w, h, 22);
    ctx.clip();

    for (const petala of PETALAS) {
        // (faseY + t) % 1 garante que a pétala reaparece no topo ao sair
        // embaixo, então o último quadro emenda no primeiro sem piscar.
        const progresso = (petala.faseY + t) % 1;
        const y = progresso * (h + 40) - 20;
        const x = petala.x * w + Math.sin((progresso + petala.x) * Math.PI * 2) * 18 + petala.deriva * h;
        const alpha = 0.35 + 0.4 * Math.sin(progresso * Math.PI);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(progresso * Math.PI * 2 * petala.giro);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = petala.tamanho % 2 === 0 ? c1 : c2;
        ctx.beginPath();
        ctx.ellipse(0, 0, petala.tamanho, petala.tamanho * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = c2;
    ctx.shadowColor = c1;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 6;
    drawRoundedRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.stroke();
    ctx.restore();
}

/** Ouro: brilho correndo ao longo da borda. */
function desenharOuro(ctx, t, w, h) {
    const [c1, c2] = PALETA.ouro;

    ctx.save();
    ctx.strokeStyle = c2;
    ctx.lineWidth = 6;
    drawRoundedRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.stroke();

    // Gradiente que "gira" ao redor da carta, criando o efeito de um
    // ponto de luz percorrendo a moldura.
    const ang = t * Math.PI * 2;
    const cx = w / 2, cy = h / 2;
    const raio = Math.max(w, h);
    const brilho = ctx.createLinearGradient(
        cx + Math.cos(ang) * raio, cy + Math.sin(ang) * raio,
        cx - Math.cos(ang) * raio, cy - Math.sin(ang) * raio
    );
    brilho.addColorStop(0, 'rgba(255,255,255,0)');
    brilho.addColorStop(0.42, c1);
    brilho.addColorStop(0.5, '#FFFFFF');
    brilho.addColorStop(0.58, c1);
    brilho.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.strokeStyle = brilho;
    ctx.shadowColor = c1;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 7;
    drawRoundedRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.stroke();
    ctx.restore();
}

const EFEITOS = {
    neon: desenharNeon,
    holografica: desenharHolografica,
    sakura: desenharSakura,
    ouro: desenharOuro
};

/**
 * Renderiza a carta animada.
 *
 * @param {object} cardData
 * @param {string} moldura
 * @returns {Promise<Buffer>} buffer do GIF
 * @throws se `gif-encoder-2` não estiver instalado
 */
async function buildAnimatedCard(cardData, moldura) {
    const efeito = EFEITOS[moldura];
    if (!efeito) throw new Error(`Moldura "${moldura}" não tem animação.`);

    // require aqui dentro (e não no topo) para o bot continuar subindo
    // mesmo sem a dependência instalada — quem chama trata o erro e cai
    // para o PNG estático.
    const GIFEncoder = require('gif-encoder-2');

    // 1) Carta estática, renderizada uma única vez.
    const builder = new CardBuilder(cardData, { moldura: 'nenhuma' });
    const baseBuffer = await builder.build();
    const { loadImage } = require('canvas');
    const baseImage = await loadImage(baseBuffer);

    // 2) Canvas de trabalho, no tamanho reduzido do GIF.
    const canvas = createCanvas(GIF_W, GIF_H);
    const ctx = canvas.getContext('2d');

    // 'neuquant' dá uma paleta melhor para arte colorida; o otimizador
    // aproveita que o miolo não muda entre quadros.
    const encoder = new GIFEncoder(GIF_W, GIF_H, 'neuquant', true, FRAMES);
    encoder.setDelay(DELAY_MS);
    encoder.setRepeat(0);       // 0 = repete para sempre
    encoder.setQuality(10);
    encoder.start();

    for (let i = 0; i < FRAMES; i++) {
        const t = i / FRAMES;
        ctx.clearRect(0, 0, GIF_W, GIF_H);
        ctx.drawImage(baseImage, 0, 0, GIF_W, GIF_H);
        efeito(ctx, t, GIF_W, GIF_H);
        encoder.addFrame(ctx);
    }

    encoder.finish();
    return encoder.out.getData();
}

module.exports = {
    buildAnimatedCard,
    ehAnimada,
    MOLDURAS_ANIMADAS,
    FRAMES,
    GIF_W,
    GIF_H
};
