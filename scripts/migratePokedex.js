/**
 * Preenche a Pokédex retroativamente.
 *
 * A Pokédex passou a existir depois que o bot já estava rodando, então
 * quem já tinha cartas no inventário estava com a Pokédex zerada. Este
 * script varre os inventários e registra como "descobertas" todas as
 * cartas que cada jogador já possui.
 *
 * Também aproveita para preencher `originalCardId` nos anúncios antigos
 * do mercado, que não tinham esse vínculo com o catálogo.
 *
 * Uso:  npm run migrate:pokedex
 *
 * É seguro rodar mais de uma vez — nada é duplicado.
 */

require('dotenv/config');
const mongoose = require('mongoose');
const User = require('../Commands/utils/userSchema');
const Card = require('../Commands/utils/cardSchema');
const Market = require('../Commands/utils/marketSchema');

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não definido no .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado ao MongoDB.\n');

    const totalCartas = await Card.countDocuments();
    console.log(`Catálogo com ${totalCartas} cartas.`);

    const usuarios = await User.find({}).select('id inventory discovered').lean();
    console.log(`${usuarios.length} jogador(es) para processar.\n`);

    let atualizados = 0;
    let registrosNovos = 0;

    for (const usuario of usuarios) {
        const jaDescobertas = new Set((usuario.discovered || []).map((d) => String(d.cardId)));

        // originalCardId aponta para a carta no catálogo. Cartas muito
        // antigas podem não ter esse campo — nesse caso não há como saber
        // de qual carta do catálogo elas vieram, então são ignoradas.
        const idsDoInventario = new Set(
            (usuario.inventory || [])
                .map((c) => c.originalCardId)
                .filter(Boolean)
                .map(String)
        );

        const faltando = [...idsDoInventario].filter((id) => !jaDescobertas.has(id));
        if (faltando.length === 0) continue;

        await User.updateOne(
            { id: usuario.id },
            {
                $push: {
                    discovered: {
                        $each: faltando.map((id) => ({
                            cardId: new mongoose.Types.ObjectId(id),
                            firstObtainedAt: new Date()
                        }))
                    }
                }
            }
        );

        atualizados++;
        registrosNovos += faltando.length;
        console.log(`  ✓ ${usuario.id}: +${faltando.length} carta(s) na Pokédex`);
    }

    console.log(`\n${atualizados} jogador(es) atualizados, ${registrosNovos} registro(s) criados.`);

    // Anúncios antigos do mercado sem vínculo com o catálogo.
    const semVinculo = await Market.countDocuments({ originalCardId: { $exists: false } });
    if (semVinculo > 0) {
        console.log(`\n⚠️  ${semVinculo} anúncio(s) antigos no mercado não têm originalCardId.`);
        console.log('   Quem comprar essas cartas não vai registrá-las na Pokédex.');
        console.log('   Tentando recuperar o vínculo pelo nome + série...');

        const anuncios = await Market.find({ originalCardId: { $exists: false } }).lean();
        let recuperados = 0;
        for (const anuncio of anuncios) {
            const carta = await Card.findOne({ name: anuncio.cardName, series: anuncio.series }).select('_id').lean();
            if (carta) {
                await Market.updateOne({ _id: anuncio._id }, { originalCardId: carta._id });
                recuperados++;
            }
        }
        console.log(`   ${recuperados} de ${anuncios.length} anúncio(s) religados ao catálogo.`);
    }

    console.log('\nConcluído.');
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Erro na migração:', err);
    process.exit(1);
});
