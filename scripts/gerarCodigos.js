/**
 * Gera códigos de resgate.
 *
 * É o caminho para vender antes do checkout automático existir: você
 * recebe o PIX na mão, roda isto, e manda o código para o comprador. Ele
 * ativa sozinho com `/redeem`, sem precisar te passar o ID do Discord —
 * que é justamente o passo em que mais gente errava.
 *
 * Também serve para campanha de influenciador (`--usos 200`), prêmio de
 * evento e compensação de bug.
 *
 * Uso:
 *   npm run codigos:gerar -- --vip ouro --meses 3
 *   npm run codigos:gerar -- --vip master --meses 1 --quantos 10
 *   npm run codigos:gerar -- --caixa lendaria --quantidade 3
 *   npm run codigos:gerar -- --moedas 50000 --usos 200 --validade 30
 *   npm run codigos:gerar -- --item gema --quantidade 100 --vip bronze
 *   npm run codigos:gerar -- --carta 673359c5a5aca0fd5877e974
 *   npm run codigos:gerar -- --listar
 *   npm run codigos:gerar -- --cancelar ANI-7K4M-9QP2-XR3T
 *
 * As recompensas SOMAM: `--vip ouro --moedas 5000 --caixa elite` gera um
 * código que entrega os três.
 *
 * Opções gerais:
 *   --quantos N     quantos códigos diferentes gerar (padrão 1)
 *   --usos N        quantos jogadores podem usar CADA código (padrão 1)
 *   --validade N    dias até vencer (padrão 365; use 0 para não vencer)
 *   --origem TEXTO  'painel' | 'evento' | 'parceria' | 'mercadopago'
 *   --ref TEXTO     referência livre: id do PIX, nome da campanha
 *   --nota TEXTO    observação só para você
 */

require('dotenv/config');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const codigos = require('../Commands/utils/redeem');
const rewards = require('../Commands/utils/rewards');
const { Codigo, Resgate } = require('../Commands/utils/redeemSchema');

function parseArgs(argv) {
    const args = {
        vip: null, meses: 1,
        moedas: null, item: null, caixa: null, carta: null, quantidade: 1,
        quantos: 1, usos: 1, validade: 365,
        origem: 'painel', ref: null, nota: null,
        listar: false, cancelar: null
    };
    for (let i = 2; i < argv.length; i++) {
        const chave = argv[i];
        const valor = argv[i + 1];
        if (chave === '--vip' && valor) { args.vip = valor.toLowerCase(); i++; }
        else if (chave === '--meses' && valor) { args.meses = parseInt(valor, 10) || 1; i++; }
        else if (chave === '--moedas' && valor) { args.moedas = parseInt(valor, 10) || 0; i++; }
        else if (chave === '--item' && valor) { args.item = valor.toLowerCase(); i++; }
        else if (chave === '--caixa' && valor) { args.caixa = valor.toLowerCase(); i++; }
        else if (chave === '--carta' && valor) { args.carta = valor; i++; }
        else if (chave === '--quantidade' && valor) { args.quantidade = parseInt(valor, 10) || 1; i++; }
        else if (chave === '--quantos' && valor) { args.quantos = Math.max(1, parseInt(valor, 10) || 1); i++; }
        else if (chave === '--usos' && valor) { args.usos = Math.max(1, parseInt(valor, 10) || 1); i++; }
        else if (chave === '--validade' && valor) { args.validade = parseInt(valor, 10); i++; }
        else if (chave === '--origem' && valor) { args.origem = valor; i++; }
        else if (chave === '--ref' && valor) { args.ref = valor; i++; }
        else if (chave === '--nota' && valor) { args.nota = valor; i++; }
        else if (chave === '--listar') { args.listar = true; }
        else if (chave === '--cancelar' && valor) { args.cancelar = valor; i++; }
    }
    return args;
}

/** Monta a lista de recompensas a partir das flags. */
function montarRecompensas(args) {
    const lista = [];
    if (args.vip) lista.push({ tipo: 'vip', params: { tier: args.vip, meses: args.meses } });
    if (args.moedas) lista.push({ tipo: 'moedas', params: { quantidade: args.moedas } });
    if (args.item) lista.push({ tipo: 'item', params: { chave: args.item, quantidade: args.quantidade } });
    if (args.caixa) lista.push({ tipo: 'caixa', params: { chave: args.caixa, quantidade: args.quantidade } });
    if (args.carta) lista.push({ tipo: 'carta', params: { cardId: args.carta, quantidade: args.quantidade } });
    return lista;
}

async function listar() {
    const abertos = await Codigo.find({ cancelado: { $ne: true } })
        .sort({ criadoEm: -1 })
        .limit(40)
        .lean();

    if (abertos.length === 0) {
        console.log('\nNenhum código gerado ainda.\n');
        return;
    }

    console.log(`\n${abertos.length} código(s) mais recente(s):\n`);
    for (const c of abertos) {
        const usados = `${c.usos}/${c.usosMaximos}`;
        const vencido = c.expiraEm && new Date(c.expiraEm) <= new Date();
        const estado = vencido ? 'VENCIDO' : (c.usos >= c.usosMaximos ? 'esgotado' : 'ativo');
        const oQue = c.recompensas.map((r) => rewards.descrever(r)).join(' + ');

        console.log(`  ${c.codigo}  [${estado}] ${usados}  ${c.origem}`);
        console.log(`     ${oQue.replace(/\*\*/g, '')}`);
        if (c.referencia) console.log(`     ref: ${c.referencia}`);
    }

    const pendentes = await Resgate.find({ estado: { $ne: 'concluido' } }).lean();
    if (pendentes.length > 0) {
        console.log(`\n⚠️  ${pendentes.length} resgate(s) que não terminaram:\n`);
        for (const r of pendentes) {
            console.log(`  ${r.codigo}  jogador ${r.userId}  [${r.estado}]  entregues: [${r.entregues.join(', ')}]`);
            if (r.erro) console.log(`     erro: ${r.erro}`);
        }
        console.log('\n  Resolva a causa e finalize pelo painel — a reentrega pula o que já saiu.');
    }
    console.log('');
}

async function main() {
    const args = parseArgs(process.argv);

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);

    if (args.listar) {
        await listar();
        await mongoose.disconnect();
        return;
    }

    if (args.cancelar) {
        const doc = await codigos.cancelar(args.cancelar, args.nota || 'cancelado pelo script');
        console.log(doc
            ? `✓ ${doc.codigo} cancelado. Resgates já feitos NÃO foram desfeitos.`
            : `Nenhum código com o texto "${args.cancelar}".`);
        await mongoose.disconnect();
        return;
    }

    const recompensas = montarRecompensas(args);
    if (recompensas.length === 0) {
        console.error('Diga o que o código entrega. Ex.: --vip ouro --meses 3');
        console.error('Tipos: --vip, --moedas, --item, --caixa, --carta (podem ser combinados)');
        await mongoose.disconnect();
        process.exit(1);
    }

    // Valida ANTES de gravar qualquer coisa: gerar 50 códigos e descobrir
    // no 37º que a caixa não existe deixaria 36 códigos bons soltos.
    let validadas;
    try {
        validadas = rewards.validarLista(recompensas);
    } catch (err) {
        console.error(`\n✗ ${err.message}\n`);
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`\nCada código entrega:`);
    for (const r of validadas) console.log(`  • ${rewards.descrever(r).replace(/\*\*/g, '')}`);
    console.log(`\nUsos por código: ${args.usos}`);
    console.log(`Validade: ${args.validade > 0 ? `${args.validade} dias` : 'não vence'}\n`);

    const gerados = [];
    for (let i = 0; i < args.quantos; i++) {
        const doc = await codigos.criar({
            recompensas,
            origem: args.origem,
            referencia: args.ref,
            usosMaximos: args.usos,
            validadeDias: args.validade > 0 ? args.validade : null,
            criadoPor: 'script',
            observacao: args.nota
        });
        gerados.push(doc.codigo);
    }

    console.log(`✓ ${gerados.length} código(s) gerado(s):\n`);
    for (const c of gerados) console.log(`  ${c}`);
    console.log(`\nMande para o jogador junto da instrução:  /redeem code:${gerados[0]}\n`);

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Erro:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
