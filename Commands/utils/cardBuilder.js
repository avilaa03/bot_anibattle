const { createCanvas, loadImage } = require('canvas');

const MAX_NAME_LENGTH = 22;
const CARD_RADIUS = 16;

const RARITY_COLORS = {
    common: {
        border: '#9E9E9E',
        text: '#BDBDBD',
        accent: '#757575',
        bg: '#37474F',
        bgGradient: ['#455A64', '#263238'],
        barAlpha: 0.35
    },
    rare: {
        border: '#2196F3',
        text: '#90CAF9',
        accent: '#1976D2',
        bg: '#0D47A1',
        bgGradient: ['#1565C0', '#0D47A1'],
        barAlpha: 0.4
    },
    'ultra rare': {
        border: '#9C27B0',
        text: '#CE93D8',
        accent: '#7B1FA2',
        bg: '#4A148C',
        bgGradient: ['#6A1B9A', '#4A148C'],
        barAlpha: 0.45
    },
    legendary: {
        border: '#FF9800',
        text: '#FFE0B2',
        accent: '#E65100',
        bg: '#E65100',
        bgGradient: ['#FF9800', '#BF360C'],
        barAlpha: 0.5
    },
    master: {
        border: '#FFD700',
        text: '#FFF8E1',
        accent: '#FFA000',
        bg: '#FF6F00',
        bgGradient: ['#FFD700', '#FF8F00'],
        barAlpha: 0.55
    }
};

function getRarityStyle(rarity) {
    const key = (rarity || 'common').toLowerCase();
    return RARITY_COLORS[key] || RARITY_COLORS.common;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function truncateName(name) {
    if (!name || typeof name !== 'string') return 'Carta';
    const trimmed = name.trim();
    if (trimmed.length <= MAX_NAME_LENGTH) return trimmed.toUpperCase();
    return trimmed.slice(0, MAX_NAME_LENGTH - 2).trim() + '…';
}

class CardBuilder {
    constructor(cardData = {}) {
        this.cardData = cardData;
        this.canvas = createCanvas(500, 700);
        this.context = this.canvas.getContext('2d');
    }

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
        try {
            this.baseImage = await loadImage(this.cardData.baseImage);
        } catch (e) {
            this.baseImage = null;
        }
        try {
            this.characterImage = await loadImage(this.cardData.characterImage);
        } catch (e) {
            this.characterImage = null;
        }
        try {
            this.seriesImage = await loadImage(this.cardData.seriesImage);
        } catch (e) {
            this.seriesImage = null;
        }
    }

    drawTemplate() {
        const ctx = this.context;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const style = getRarityStyle(this.cardData.rarity);
        const rarityKey = (this.cardData.rarity || 'common').toLowerCase();
        const isHighRarity = rarityKey === 'legendary' || rarityKey === 'master';

        ctx.save();
        drawRoundedRect(ctx, 6, 6, w - 12, h - 12, CARD_RADIUS - 2);
        ctx.clip();

        const [g1, g2] = style.bgGradient || [style.bg, style.border];
        const gradient = ctx.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, g1);
        gradient.addColorStop(1, g2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        if (this.baseImage) {
            ctx.globalAlpha = 0.85;
            ctx.drawImage(this.baseImage, 0, 0, w, h);
            ctx.globalAlpha = 1;
            ctx.fillStyle = style.bg;
            ctx.globalAlpha = 0.25;
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 1;
        }

        const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.7, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);

        ctx.restore();

        if (isHighRarity) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = style.border;
            for (let i = 1; i <= 5; i++) {
                ctx.lineWidth = 4 + i * 2;
                drawRoundedRect(ctx, 3 - i * 2, 3 - i * 2, w - 6 + i * 4, h - 6 + i * 4, CARD_RADIUS + i * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.strokeStyle = style.border;
        ctx.lineWidth = 6;
        drawRoundedRect(ctx, 3, 3, w - 6, h - 6, CARD_RADIUS);
        ctx.stroke();

        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, 8, 8, w - 16, h - 16, CARD_RADIUS - 4);
        ctx.stroke();
    }

    drawCharacter() {
        const ctx = this.context;
        const w = this.canvas.width;
        const style = getRarityStyle(this.cardData.rarity);

        const charX = 60;
        const charY = 160;
        const charW = 380;
        const charH = 340;

        ctx.save();
        drawRoundedRect(ctx, charX - 4, charY - 4, charW + 8, charH + 8, 12);
        ctx.fillStyle = style.border;
        ctx.globalAlpha = style.barAlpha ?? 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        if (this.characterImage) {
            ctx.save();
            drawRoundedRect(ctx, charX, charY, charW, charH, 8);
            ctx.clip();
            ctx.drawImage(this.characterImage, charX, charY, charW, charH);
            ctx.restore();
        } else {
            ctx.fillStyle = '#455A64';
            ctx.fillRect(charX, charY, charW, charH);
            ctx.fillStyle = '#78909C';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Imagem indisponível', w / 2, 330);
        }
    }

    drawText() {
        const ctx = this.context;
        const w = this.canvas.width;
        const style = getRarityStyle(this.cardData.rarity);
        const name = truncateName(this.cardData.name);
        const barAlpha = style.barAlpha ?? 0.35;

        ctx.save();
        ctx.fillStyle = style.accent;
        ctx.globalAlpha = barAlpha;
        drawRoundedRect(ctx, 40, 95, w - 80, 52, 10);
        ctx.fill();
        ctx.restore();

        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = style.text;
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(name, 250, 142);

        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.save();
        ctx.fillStyle = style.border;
        ctx.globalAlpha = 0.6;
        drawRoundedRect(ctx, 50, 118, 58, 42, 8);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 52px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(String(this.cardData.overall ?? 0), 79, 152);

        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = style.text;
        ctx.textAlign = 'center';
        ctx.fillText((this.cardData.rarity || 'common').toUpperCase(), 250, 652);

        if (this.seriesImage) {
            ctx.drawImage(this.seriesImage, 150, 478, 200, 80);
        }

        ctx.save();
        ctx.fillStyle = style.accent;
        ctx.globalAlpha = barAlpha;
        drawRoundedRect(ctx, 30, 548, w - 60, 52, 10);
        ctx.fill();
        ctx.restore();

        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(`ATA ${this.cardData.ATA ?? 0}`, 110, 582);
        ctx.fillText(`LIF ${this.cardData.LIF ?? 0}`, 250, 582);
        ctx.fillText(`POW ${this.cardData.POW ?? 0}`, 390, 582);
    }

    async build() {
        await this.loadImages();
        this.drawTemplate();
        this.drawCharacter();
        this.drawText();
        return this.canvas.toBuffer();
    }
}

module.exports = CardBuilder;
