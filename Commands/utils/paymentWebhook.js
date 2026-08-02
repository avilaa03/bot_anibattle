const crypto = require('crypto');
const express = require('express');
const { concederVip, VipError } = require('./vipService');
const { TIERS } = require('./vip');

/**
 * Webhook de pagamento.
 *
 * O provedor (Mercado Pago, Stripe, ou seu próprio site) chama este
 * endpoint depois que o PIX/cartão é aprovado, e o bot ativa o VIP.
 *
 * Segurança: o endpoint é autenticado por um segredo compartilhado no
 * header `x-webhook-secret`. Sem isso, qualquer pessoa que descobrisse a
 * URL do seu servidor conseguiria dar VIP de graça para si mesma.
 *
 * Configure PAYMENT_WEBHOOK_SECRET no .env com um valor longo e aleatório.
 * Se a variável não estiver definida, o endpoint fica desligado — é mais
 * seguro não existir do que existir sem senha.
 */

/** Comparação em tempo constante, para não vazar o segredo por timing. */
function segredoConfere(recebido, esperado) {
    if (typeof recebido !== 'string' || recebido.length === 0) return false;
    const a = Buffer.from(recebido);
    const b = Buffer.from(esperado);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * @param {import('discord.js').Client} client usado para avisar o usuário no privado
 * @returns {import('express').Router}
 */
function criarRotaPagamento(client) {
    const router = express.Router();
    const SEGREDO = process.env.PAYMENT_WEBHOOK_SECRET;

    if (!SEGREDO) {
        router.post('/webhook/pagamento', (req, res) => {
            res.status(503).json({ erro: 'Webhook desativado: PAYMENT_WEBHOOK_SECRET não configurado.' });
        });
        return router;
    }

    router.post('/webhook/pagamento', express.json({ limit: '100kb' }), async (req, res) => {
        if (!segredoConfere(req.get('x-webhook-secret'), SEGREDO)) {
            // Resposta genérica de propósito: não confirmamos se a rota existe.
            return res.status(401).json({ erro: 'não autorizado' });
        }

        const { discordUserId, tier, meses, providerPaymentId, provider, valorBRL } = req.body || {};

        if (!discordUserId || !tier || !providerPaymentId) {
            return res.status(400).json({
                erro: 'campos obrigatórios: discordUserId, tier, providerPaymentId'
            });
        }
        if (!TIERS[tier]) {
            return res.status(400).json({ erro: `tier inválido. Use: ${Object.keys(TIERS).join(', ')}` });
        }

        try {
            const resultado = await concederVip({
                discordUserId: String(discordUserId),
                tier,
                meses: Number(meses) > 0 ? Number(meses) : 1,
                providerPaymentId: String(providerPaymentId),
                provider: provider || 'webhook',
                valorBRL: Number(valorBRL) || TIERS[tier].precoBRL,
                payloadBruto: req.body
            });

            if (resultado.duplicado) {
                // Provedores reenviam webhook com frequência — devolvemos 200
                // para o provedor parar de tentar, sem conceder de novo.
                return res.json({ ok: true, duplicado: true, mensagem: 'pagamento já processado' });
            }

            avisarUsuario(client, discordUserId, tier, resultado.user).catch(() => {});

            console.log(`VIP ${tier} concedido a ${discordUserId} (pagamento ${providerPaymentId}).`);
            return res.json({
                ok: true,
                duplicado: false,
                tier,
                expiresAt: resultado.user?.vip?.expiresAt || null
            });
        } catch (err) {
            if (err instanceof VipError) {
                return res.status(400).json({ erro: err.message, codigo: err.codigo });
            }
            console.error('Erro no webhook de pagamento:', err);
            return res.status(500).json({ erro: 'erro interno' });
        }
    });

    return router;
}

/** Manda uma mensagem no privado confirmando a ativação. */
async function avisarUsuario(client, discordUserId, tierKey, user) {
    const tier = TIERS[tierKey];
    if (!tier || !client) return;

    const usuario = await client.users.fetch(discordUserId).catch(() => null);
    if (!usuario) return;

    const ui = require('./embeds');
    const expira = user?.vip?.expiresAt
        ? `<t:${Math.floor(new Date(user.vip.expiresAt).getTime() / 1000)}:D>`
        : 'nunca';

    const embed = ui.base(tier.cor)
        .setTitle(`${tier.emoji} Bem-vindo ao VIP ${tier.nome}!`)
        .setDescription('Obrigado por apoiar o AniBattle. Suas vantagens já estão ativas.')
        .addFields(
            { name: 'Válido até', value: expira, inline: true },
            { name: 'Próximo passo', value: 'Use `/cosmeticos` para equipar suas molduras.', inline: false }
        );

    await usuario.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { criarRotaPagamento };
