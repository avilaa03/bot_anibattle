/**
 * Ativa VIP manualmente para um usuário.
 *
 * Serve para testar, para presentear alguém, e principalmente para o
 * começo da operação, quando você ainda estiver recebendo PIX na mão
 * antes de ter o site com webhook automático.
 *
 * Uso:
 *   npm run vip:grant -- --user 123456789012345678 --tier ouro
 *   npm run vip:grant -- --user 123... --tier master --meses 3 --pagamento pix-0001
 *   npm run vip:grant -- --user 123... --revogar
 *
 * O id do pagamento é o que garante que a mesma ativação não seja
 * aplicada duas vezes. Se você não informar, é gerado um automático.
 */

require('dotenv/config');
const mongoose = require('mongoose');
const { concederVip, revogarVip } = require('../Commands/utils/vipService');
const { TIERS } = require('../Commands/utils/vip');
const User = require('../Commands/utils/userSchema');

function parseArgs(argv) {
    const args = { user: null, tier: null, meses: 1, pagamento: null, revogar: false };
    for (let i = 2; i < argv.length; i++) {
        const chave = argv[i];
        const valor = argv[i + 1];
        if (chave === '--user' && valor) { args.user = valor; i++; }
        else if (chave === '--tier' && valor) { args.tier = valor.toLowerCase(); i++; }
        else if (chave === '--meses' && valor) { args.meses = parseInt(valor, 10) || 1; i++; }
        else if (chave === '--pagamento' && valor) { args.pagamento = valor; i++; }
        else if (chave === '--revogar') { args.revogar = true; }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv);

    if (!args.user) {
        console.error('Informe o id do Discord: --user 123456789012345678');
        console.error('(No Discord: Configurações > Avançado > Modo desenvolvedor, depois clique com o botão direito no usuário > Copiar ID)');
        process.exit(1);
    }

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    if (args.revogar) {
        const user = await revogarVip(args.user, 'manual');
        console.log(user ? `✓ VIP removido de ${args.user}.` : `Usuário ${args.user} não encontrado.`);
        await mongoose.disconnect();
        return;
    }

    if (!args.tier || !TIERS[args.tier]) {
        console.error(`Informe um plano válido: --tier ${Object.keys(TIERS).join('|')}`);
        await mongoose.disconnect();
        process.exit(1);
    }

    const tier = TIERS[args.tier];
    const providerPaymentId = args.pagamento || `manual-${args.user}-${Date.now()}`;

    const resultado = await concederVip({
        discordUserId: args.user,
        tier: args.tier,
        meses: args.meses,
        providerPaymentId,
        provider: 'manual',
        valorBRL: tier.precoBRL * args.meses
    });

    if (resultado.duplicado) {
        console.log(`↷ Pagamento "${providerPaymentId}" já tinha sido processado. Nada foi alterado.`);
    } else {
        const expira = resultado.user.vip.expiresAt;
        console.log(`✓ ${tier.emoji} VIP ${tier.nome} ativado para ${args.user}`);
        console.log(`  ${args.meses} mês(es) — expira em ${expira ? new Date(expira).toLocaleString('pt-BR') : 'nunca'}`);
        console.log(`  id do pagamento: ${providerPaymentId}`);
    }

    const total = await User.countDocuments({ 'vip.tier': { $ne: null }, 'vip.expiresAt': { $gt: new Date() } });
    console.log(`\nAssinantes ativos no total: ${total}`);

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
});
