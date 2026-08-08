const { createCanvas, loadImage } = require('canvas');
const { traduzir, DEFAULT_LOCALE } = require('./i18n');

const CARD_W = 500;
const CARD_H = 700;
const CARD_RADIUS = 26;
const PAD = 26;

// Pilha de fontes: node-canvas cai na primeira que existir no sistema.
const FONT = '"Helvetica Neue", "Arial", sans-serif';

const RARITY_STYLES = {
    common: {
        border: '#9E9E9E',
        accent: '#BDBDBD',
        text: '#D6D6D6',
        badgeText: '#1C1C1C',
        backdrop: ['#4A5560', '#232A30'],
        glow: 0,
        sheen: false
    },
    rare: {
        border: '#2196F3',
        accent: '#64B5F6',
        text: '#BBDEFB',
        badgeText: '#06294D',
        backdrop: ['#1565C0', '#0A2B54'],
        glow: 6,
        sheen: false
    },
    'ultra rare': {
        border: '#AB47BC',
        accent: '#CE93D8',
        text: '#E1BEE7',
        badgeText: '#2E0A38',
        backdrop: ['#6A1B9A', '#331046'],
        glow: 10,
        sheen: false
    },
    legendary: {
        border: '#FF9800',
        accent: '#FFB74D',
        text: '#FFD9A3',
        badgeText: '#3D2400',
        backdrop: ['#8A4B10', '#331F08'],
        glow: 16,
        sheen: true
    },
    master: {
        border: '#FFD700',
        accent: '#FFE082',
        text: '#FFEDA1',
        badgeText: '#4A3B00',
        backdrop: ['#8A7410', '#332B06'],
        glow: 22,
        sheen: true
    }
};

function getRarityStyle(rarity) {
    const key = String(rarity || 'common').toLowerCase();
    return RARITY_STYLES[key] || RARITY_STYLES.common;
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

/** Desenha a imagem preenchendo a área toda sem distorcer (estilo CSS object-fit: cover). */
function drawImageCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    // Ancorado no topo horizontalmente centralizado: em arte de personagem
    // o rosto quase sempre está na parte de cima, então cortar por baixo
    // preserva melhor o enquadramento do que centralizar.
    const dx = x + (w - drawW) / 2;
    const dy = y;
    ctx.drawImage(img, dx, dy, drawW, drawH);
}

/** Desenha a imagem inteira dentro da área, sem cortar (estilo object-fit: contain). */
function drawImageContain(ctx, img, x, y, w, h) {
    const scale = Math.min(w / img.width, h / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    ctx.drawImage(img, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

/** Reduz o tamanho da fonte até o texto caber na largura disponível. */
function fitText(ctx, text, maxWidth, startSize, minSize, weight = 'bold') {
    let size = startSize;
    ctx.font = `${weight} ${size}px ${FONT}`;
    while (ctx.measureText(text).width > maxWidth && size > minSize) {
        size -= 2;
        ctx.font = `${weight} ${size}px ${FONT}`;
    }
    return size;
}

/** Desenha texto com espaçamento entre letras (node-canvas não tem letterSpacing). */
function drawSpacedText(ctx, text, centerX, y, spacing) {
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cursor = centerX - total / 2;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    chars.forEach((c, i) => {
        ctx.fillText(c, cursor, y);
        cursor += widths[i] + spacing;
    });
    ctx.textAlign = prevAlign;
}

class CardBuilder {
    /**
     * @param {object} cardData dados da carta
     * @param {object} [opcoes]
     * @param {string} [opcoes.moldura] moldura cosmética de VIP ('nenhuma' por padrão).
     *   É puramente visual: desenhada por cima, nunca altera atributo.
     * @param {string} [opcoes.locale] idioma dos rótulos desenhados na arte
     *   (siglas dos atributos e selo de raridade). Só isso muda entre os
     *   idiomas — nome, série e números são iguais nos dois.
     */
    constructor(cardData = {}, opcoes = {}) {
        this.cardData = cardData;
        this.moldura = opcoes.moldura || 'nenhuma';
        this.locale = opcoes.locale || DEFAULT_LOCALE;
        this.canvas = createCanvas(CARD_W, CARD_H);
        this.context = this.canvas.getContext('2d');
    }

    setMoldura(moldura) { this.moldura = moldura || 'nenhuma'; }

    setName(name) { this.cardData.name = name; }
    setSeries(series) { this.cardData.series = series; }
    setSeriesImage(imageUrl) { this.cardData.seriesImage = imageUrl; }
    setBaseImage(imageUrl) { this.cardData.baseImage = imageUrl; }
    setCharacterImage(imageUrl) { this.cardData.characterImage = imageUrl; }
    setOverall(overall) { this.cardData.overall = overall; }
    setATA(ATA) { this.cardData.ATA = ATA; }
    setLIF(LIF) { this.cardData.LIF = LIF; }
    setPOW(POW) { this.cardData.POW = POW; }
    setRarity(rarity) { this.cardData.rarity = rarity; }

    async loadImages() {
        const clean = (u) => (typeof u === 'string' && u.trim().length > 0 ? u.trim() : null);
        const tryLoad = async (url) => {
            if (!url) return null;
            try {
                return await loadImage(url);
            } catch (e) {
                return null;
            }
        };
        const [baseImage, characterImage, seriesImage] = await Promise.all([
            tryLoad(clean(this.cardData.baseImage)),
            tryLoad(clean(this.cardData.characterImage)),
            tryLoad(clean(this.cardData.seriesImage))
        ]);
        this.baseImage = baseImage;
        this.characterImage = characterImage;
        this.seriesImage = seriesImage;
    }

    /** Fundo + arte do personagem, tudo recortado no formato da carta. */
    drawArtwork() {
        const ctx = this.context;
        const style = getRarityStyle(this.cardData.rarity);

        ctx.save();
        drawRoundedRect(ctx, 0, 0, CARD_W, CARD_H, CARD_RADIUS);
        ctx.clip();

        // Fundo base gerado por código, com a cor da raridade. Só aparece
        // onde a arte não cobre (ou se a arte for um PNG com transparência).
        const bg = ctx.createLinearGradient(0, 0, CARD_W * 0.6, CARD_H);
        bg.addColorStop(0, style.backdrop[0]);
        bg.addColorStop(1, style.backdrop[1]);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CARD_W, CARD_H);

        // baseImage é cenário opcional atrás do personagem.
        if (this.baseImage) {
            drawImageCover(ctx, this.baseImage, 0, 0, CARD_W, CARD_H);
        }

        if (this.characterImage) {
            drawImageCover(ctx, this.characterImage, 0, 0, CARD_W, CARD_H);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = `500 22px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.fillText('Imagem indisponível', CARD_W / 2, CARD_H / 2);
        }

        // Brilho diagonal nas raridades altas, por cima da arte.
        if (style.sheen) {
            const sheen = ctx.createLinearGradient(0, CARD_H, CARD_W, 0);
            sheen.addColorStop(0.30, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.46, 'rgba(255,255,255,0.14)');
            sheen.addColorStop(0.60, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen;
            ctx.fillRect(0, 0, CARD_W, CARD_H);
        }

        // Escurecimento no topo (para o badge e a raridade lerem bem) e
        // principalmente embaixo, onde ficam nome, série e atributos.
        const topScrim = ctx.createLinearGradient(0, 0, 0, 170);
        topScrim.addColorStop(0, 'rgba(0,0,0,0.55)');
        topScrim.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topScrim;
        ctx.fillRect(0, 0, CARD_W, 170);

        const bottomScrim = ctx.createLinearGradient(0, CARD_H * 0.42, 0, CARD_H);
        bottomScrim.addColorStop(0, 'rgba(0,0,0,0)');
        bottomScrim.addColorStop(0.55, 'rgba(0,0,0,0.86)');
        bottomScrim.addColorStop(1, 'rgba(0,0,0,0.97)');
        ctx.fillStyle = bottomScrim;
        ctx.fillRect(0, CARD_H * 0.42, CARD_W, CARD_H * 0.58);

        ctx.restore();
    }

    /** Moldura da raridade: brilho externo + borda dupla. */
    drawFrame() {
        const ctx = this.context;
        const style = getRarityStyle(this.cardData.rarity);

        if (style.glow > 0) {
            ctx.save();
            ctx.strokeStyle = style.border;
            ctx.shadowColor = style.border;
            ctx.shadowBlur = style.glow;
            ctx.lineWidth = 5;
            drawRoundedRect(ctx, 4, 4, CARD_W - 8, CARD_H - 8, CARD_RADIUS - 2);
            ctx.stroke();
            ctx.stroke();
            ctx.restore();
        }

        ctx.strokeStyle = style.border;
        ctx.lineWidth = 5;
        drawRoundedRect(ctx, 4, 4, CARD_W - 8, CARD_H - 8, CARD_RADIUS - 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, 11, 11, CARD_W - 22, CARD_H - 22, CARD_RADIUS - 8);
        ctx.stroke();
    }

    /**
     * Moldura cosmética de VIP, desenhada por cima da moldura de raridade.
     * Só aparência — nenhum atributo da carta é tocado aqui.
     */
    drawCosmeticFrame() {
        const moldura = this.moldura;
        if (!moldura || moldura === 'nenhuma') return;

        const ctx = this.context;
        const paleta = {
            bronze: ['#CD7F32', '#8B5A2B'],
            prata: ['#E8E8E8', '#9E9E9E'],
            ouro: ['#FFD700', '#B8860B'],
            sakura: ['#FFB7C5', '#FF69B4'],
            holografica: ['#FF00CC', '#00E5FF'],
            neon: ['#39FF14', '#00E5FF']
        }[moldura];

        if (!paleta) return;
        const [c1, c2] = paleta;

        ctx.save();

        if (moldura === 'holografica') {
            // Faixa iridescente atravessando a carta.
            ctx.save();
            drawRoundedRect(ctx, 0, 0, CARD_W, CARD_H, CARD_RADIUS);
            ctx.clip();
            const faixa = ctx.createLinearGradient(0, CARD_H, CARD_W, 0);
            faixa.addColorStop(0.20, 'rgba(255,255,255,0)');
            faixa.addColorStop(0.38, `${c1}55`);
            faixa.addColorStop(0.50, 'rgba(255,255,255,0.25)');
            faixa.addColorStop(0.62, `${c2}55`);
            faixa.addColorStop(0.80, 'rgba(255,255,255,0)');
            ctx.fillStyle = faixa;
            ctx.fillRect(0, 0, CARD_W, CARD_H);
            ctx.restore();
        }

        if (moldura === 'neon') {
            // Contorno neon: várias passadas com brilho crescente.
            for (const [cor, blur, largura] of [[c2, 26, 9], [c1, 16, 6], ['#FFFFFF', 6, 2.5]]) {
                ctx.strokeStyle = cor;
                ctx.shadowColor = cor;
                ctx.shadowBlur = blur;
                ctx.lineWidth = largura;
                drawRoundedRect(ctx, 7, 7, CARD_W - 14, CARD_H - 14, CARD_RADIUS - 4);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        // Borda dupla com gradiente, comum a bronze/prata/ouro/sakura.
        const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
        grad.addColorStop(0, c1);
        grad.addColorStop(0.5, c2);
        grad.addColorStop(1, c1);

        ctx.strokeStyle = grad;
        ctx.shadowColor = c1;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 7;
        drawRoundedRect(ctx, 7, 7, CARD_W - 14, CARD_H - 14, CARD_RADIUS - 4);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = c2;
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, 17, 17, CARD_W - 34, CARD_H - 34, CARD_RADIUS - 10);
        ctx.stroke();

        if (moldura === 'ouro' || moldura === 'sakura') {
            this.drawCornerOrnaments(moldura === 'sakura' ? c2 : c1, moldura === 'sakura');
        }

        ctx.restore();
    }

    /** Ornamentos nos quatro cantos (losangos, ou pétalas no caso da sakura). */
    drawCornerOrnaments(cor, petala = false) {
        const ctx = this.context;
        const cantos = [
            [30, 30], [CARD_W - 30, 30],
            [30, CARD_H - 30], [CARD_W - 30, CARD_H - 30]
        ];

        ctx.save();
        ctx.fillStyle = cor;
        ctx.shadowColor = cor;
        ctx.shadowBlur = 8;

        for (const [x, y] of cantos) {
            ctx.beginPath();
            if (petala) {
                // Cinco pétalas em círculo.
                for (let i = 0; i < 5; i++) {
                    const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
                    const px = x + Math.cos(ang) * 9;
                    const py = y + Math.sin(ang) * 9;
                    ctx.moveTo(x, y);
                    ctx.arc(px, py, 5, 0, Math.PI * 2);
                }
            } else {
                // Losango simples.
                ctx.moveTo(x, y - 11);
                ctx.lineTo(x + 11, y);
                ctx.lineTo(x, y + 11);
                ctx.lineTo(x - 11, y);
                ctx.closePath();
            }
            ctx.fill();
        }
        ctx.restore();
    }

    /** Badge de overall (topo esquerdo) e pílula de raridade (topo direito). */
    drawHeader() {
        const ctx = this.context;
        const style = getRarityStyle(this.cardData.rarity);
        const overall = this.cardData.overall ?? 0;

        const badgeSize = 86;
        const bx = PAD;
        const by = PAD;

        ctx.save();
        drawRoundedRect(ctx, bx, by, badgeSize, badgeSize, 16);
        const badgeGrad = ctx.createLinearGradient(bx, by, bx + badgeSize, by + badgeSize);
        badgeGrad.addColorStop(0, style.accent);
        badgeGrad.addColorStop(1, style.border);
        ctx.fillStyle = badgeGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = style.badgeText;
        ctx.textAlign = 'center';
        const ovrSize = fitText(ctx, String(overall), badgeSize - 20, 44, 26);
        ctx.font = `bold ${ovrSize}px ${FONT}`;
        ctx.fillText(String(overall), bx + badgeSize / 2, by + badgeSize / 2 + 10);

        ctx.font = `bold 13px ${FONT}`;
        ctx.globalAlpha = 0.75;
        drawSpacedText(ctx, 'OVR', bx + badgeSize / 2, by + badgeSize - 13, 1.5);
        ctx.globalAlpha = 1;

        // Pílula de raridade. O texto vem do dicionário, não da chave do
        // banco — senão a carta sairia escrita "ULTRA RARE" mesmo com o
        // bot todo em português.
        const chaveRaridade = String(this.cardData.rarity || 'common').toLowerCase().trim().replace(/ /g, '_');
        const rarityLabel = traduzir(this.locale, `raridades.${chaveRaridade}`, {}).toUpperCase();
        ctx.font = `bold 15px ${FONT}`;
        const labelChars = [...rarityLabel];
        const labelWidth = labelChars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + 2 * (labelChars.length - 1);
        const pillW = labelWidth + 30;
        const pillH = 34;
        const px = CARD_W - PAD - pillW;
        const py = PAD + 4;

        ctx.save();
        drawRoundedRect(ctx, px, py, pillW, pillH, pillH / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        ctx.strokeStyle = style.border;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = style.text;
        ctx.font = `bold 15px ${FONT}`;
        drawSpacedText(ctx, rarityLabel, px + pillW / 2, py + pillH / 2 + 5, 2);
    }

    /** Nome, série, divisória e a linha de atributos. */
    drawFooter() {
        const ctx = this.context;
        const style = getRarityStyle(this.cardData.rarity);
        const maxWidth = CARD_W - PAD * 2;

        // Logo da série (opcional) logo acima do nome, à direita.
        if (this.seriesImage) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            drawImageContain(ctx, this.seriesImage, CARD_W - PAD - 150, 470, 150, 54);
            ctx.restore();
        }

        const name = String(this.cardData.name || traduzir(this.locale, 'comum.carta')).trim();
        const displayName = name.charAt(0).toUpperCase() + name.slice(1);

        ctx.textAlign = 'left';
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#FFFFFF';
        const nameSize = fitText(ctx, displayName, maxWidth, 46, 24);
        ctx.font = `bold ${nameSize}px ${FONT}`;
        ctx.fillText(displayName, PAD, 566);
        ctx.restore();

        if (this.cardData.series) {
            ctx.fillStyle = style.text;
            const seriesSize = fitText(ctx, this.cardData.series, maxWidth, 20, 13, '500');
            ctx.font = `500 ${seriesSize}px ${FONT}`;
            ctx.fillText(this.cardData.series, PAD, 594);
        }

        // Divisória
        ctx.strokeStyle = style.border;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(PAD, 616);
        ctx.lineTo(CARD_W - PAD, 616);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Atributos
        const stats = [
            { label: traduzir(this.locale, 'atributos.ata'), value: this.cardData.ATA ?? 0 },
            { label: traduzir(this.locale, 'atributos.lif'), value: this.cardData.LIF ?? 0 },
            { label: traduzir(this.locale, 'atributos.pow'), value: this.cardData.POW ?? 0 }
        ];
        const colWidth = (CARD_W - PAD * 2) / 3;

        ctx.textAlign = 'center';
        stats.forEach((stat, i) => {
            const cx = PAD + colWidth * i + colWidth / 2;

            ctx.fillStyle = style.text;
            ctx.globalAlpha = 0.8;
            ctx.font = `bold 14px ${FONT}`;
            drawSpacedText(ctx, stat.label, cx, 645, 2);
            ctx.globalAlpha = 1;

            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold 32px ${FONT}`;
            ctx.fillText(String(stat.value), cx, 678);
        });
    }

    async build() {
        await this.loadImages();
        this.drawArtwork();
        this.drawHeader();
        this.drawFooter();
        this.drawFrame();
        this.drawCosmeticFrame();
        return this.canvas.toBuffer();
    }
}

module.exports = CardBuilder;
