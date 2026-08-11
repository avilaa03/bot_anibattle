const mongoose = require('mongoose');

/**
 * Publica o estado do bot no banco, para o painel do site ler.
 *
 * O site poderia perguntar isso à API do Discord, mas para listar os
 * servidores do bot ele precisaria do TOKEN do bot — e aí um site
 * hospedado na Vercel passaria a carregar a credencial que controla o bot
 * inteiro. Não vale o risco por uma lista de servidores.
 *
 * Aqui o caminho é o contrário: o bot escreve o que sabe numa coleção, o
 * site só lê. O token nunca sai daqui.
 *
 * Efeito colateral útil: `atualizadoEm` funciona como sinal de vida. Se o
 * carimbo está velho, o bot caiu — e o painel mostra isso sem precisar de
 * serviço de monitoramento externo.
 */

const COLECAO = 'bot_status';
const ID = 'principal';
const INTERVALO_MS = 60 * 1000;

let cronometro = null;

function colecao() {
    return mongoose.connection.collection(COLECAO);
}

async function publicar(client) {
    if (mongoose.connection.readyState !== 1) return;

    const servidores = client.guilds.cache.map((g) => ({
        id: g.id,
        nome: g.name,
        icone: g.icon,
        membros: g.memberCount ?? 0,
        entrouEm: g.joinedAt ?? null,
        dono: g.ownerId ?? null
    }));

    await colecao().updateOne(
        { _id: ID },
        {
            $set: {
                atualizadoEm: new Date(),
                iniciadoEm: new Date(Date.now() - process.uptime() * 1000),
                servidores: servidores.sort((a, b) => b.membros - a.membros),
                totalServidores: servidores.length,
                totalMembros: servidores.reduce((soma, g) => soma + (g.membros || 0), 0),
                bot: client.user ? { id: client.user.id, tag: client.user.tag } : null,
                versaoNode: process.version
            }
        },
        { upsert: true }
    );
}

/** Marca o bot como desligado — chamado no encerramento limpo. */
async function marcarOffline() {
    if (mongoose.connection.readyState !== 1) return;
    await colecao().updateOne(
        { _id: ID },
        { $set: { desligadoEm: new Date() } },
        { upsert: true }
    ).catch(() => {});
}

/**
 * Começa a publicar: uma vez agora, depois a cada minuto, e sempre que
 * entrar ou sair de um servidor (para o painel não esperar o intervalo).
 */
function iniciar(client) {
    const enviar = () => publicar(client).catch((err) => {
        console.error('[presenca] falha ao publicar estado:', err.message);
    });

    enviar();

    if (cronometro) clearInterval(cronometro);
    cronometro = setInterval(enviar, INTERVALO_MS);
    // unref: esse timer não pode segurar o processo vivo no encerramento.
    if (typeof cronometro.unref === 'function') cronometro.unref();

    client.on('guildCreate', enviar);
    client.on('guildDelete', enviar);
}

function parar() {
    if (cronometro) clearInterval(cronometro);
    cronometro = null;
}

module.exports = { iniciar, parar, publicar, marcarOffline, COLECAO, ID, INTERVALO_MS };
