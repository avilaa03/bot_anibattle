const Tournament = require('./tournamentSchema');
const User = require('./userSchema');
const { runBattle } = require('./battleEngine');
const { trySpend, addBalance } = require('./economy');
const { traduzir, DEFAULT_LOCALE } = require('./i18n');

/**
 * Torneios eliminatórios.
 *
 * Diferente do /battle, que é 1 contra 1 combinado, o torneio junta várias
 * pessoas de uma vez e resolve tudo sozinho — o jogador se inscreve com um
 * deck e depois só assiste. É o formato que funciona melhor em servidor
 * grande, porque não exige que os dois estejam online ao mesmo tempo.
 *
 * O deck é congelado na inscrição. Isso resolve dois problemas de uma vez:
 * não precisa pedir o deck a cada rodada, e ninguém troca de time no meio
 * do torneio depois de ver o adversário.
 */

const VAGAS_VALIDAS = [4, 8, 16];
const TTL_MS = 60 * 60 * 1000;   // torneio sem começar em 1h é cancelado

// Um torneio inteiro resolve em segundos: as batalhas rodam em memória,
// sem esperar ninguém. Se ficar 5 minutos em "emandamento", o bot caiu no
// meio da execução — e aí o servidor fica travado para sempre, porque
// `ativoNoServidor` considera essa fase ocupada e nada nunca a tira dela.
const TTL_EXECUCAO_MS = 5 * 60 * 1000;

function gerarId() {
    return 'tn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function ativoNoServidor(guildId) {
    return Tournament.findOne({
        guildId,
        fase: { $in: ['inscricoes', 'emandamento'] }
    });
}

async function buscar(tournamentId) {
    return Tournament.findOne({ tournamentId: String(tournamentId) });
}

async function criar({ guildId, canalId, criadorId, nome, taxaInscricao, vagas, locale = DEFAULT_LOCALE }) {
    return Tournament.create({
        tournamentId: gerarId(),
        guildId,
        canalId,
        criadorId,
        nome: nome || traduzir(locale, 'torneio.nome_padrao'),
        taxaInscricao: Math.max(0, taxaInscricao || 0),
        vagas: VAGAS_VALIDAS.includes(vagas) ? vagas : 8,
        premio: 0,
        participantes: [],
        fase: 'inscricoes'
    });
}

function jaInscrito(torneio, userId) {
    return torneio.participantes.some((p) => p.id === userId);
}

/**
 * Inscreve um jogador com as 3 melhores cartas dele.
 *
 * Usar as melhores automaticamente (em vez de pedir para escolher) é uma
 * decisão de atrito: torneio com escolha manual de deck trava esperando
 * gente responder no privado. Aqui você entra com um clique.
 */
async function inscrever(tournamentId, user, inventario) {
    const torneio = await buscar(tournamentId);
    if (!torneio || torneio.fase !== 'inscricoes') return { ok: false, motivo: 'FECHADO' };
    if (jaInscrito(torneio, user.id)) return { ok: false, motivo: 'JA_INSCRITO' };
    if (torneio.participantes.length >= torneio.vagas) return { ok: false, motivo: 'LOTADO' };
    if ((inventario || []).length < 3) return { ok: false, motivo: 'SEM_CARTAS' };

    if (torneio.taxaInscricao > 0) {
        const pago = await trySpend(user.id, torneio.taxaInscricao);
        if (!pago) return { ok: false, motivo: 'SEM_SALDO' };
        torneio.premio += torneio.taxaInscricao;
    }

    const deck = [...inventario]
        .sort((a, b) => (b.overall || 0) - (a.overall || 0))
        .slice(0, 3)
        .map((c) => ({
            _id: c._id,
            name: c.name,
            series: c.series,
            rarity: c.rarity,
            overall: c.overall,
            ATA: c.ATA,
            LIF: c.LIF,
            POW: c.POW
        }));

    torneio.participantes.push({ id: user.id, username: user.username, deck, eliminado: false });
    await torneio.save();

    return { ok: true, torneio, deck };
}

async function desinscrever(tournamentId, userId) {
    const torneio = await buscar(tournamentId);
    if (!torneio || torneio.fase !== 'inscricoes') return { ok: false, motivo: 'FECHADO' };
    if (!jaInscrito(torneio, userId)) return { ok: false, motivo: 'NAO_INSCRITO' };

    torneio.participantes = torneio.participantes.filter((p) => p.id !== userId);
    if (torneio.taxaInscricao > 0) {
        await addBalance(userId, torneio.taxaInscricao);
        torneio.premio = Math.max(0, torneio.premio - torneio.taxaInscricao);
    }
    await torneio.save();
    return { ok: true, torneio };
}

function embaralhar(lista, rng = Math.random) {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

/**
 * Roda o torneio inteiro de uma vez e devolve o histórico das rodadas.
 *
 * Se o número de inscritos não for potência de 2, quem sobra numa rodada
 * passa direto (bye) — é o comportamento padrão de chave eliminatória.
 */
async function executar(tournamentId, rng = Math.random) {
    const torneio = await Tournament.findOneAndUpdate(
        { tournamentId: String(tournamentId), fase: 'inscricoes' },
        { fase: 'emandamento' },
        { new: true }
    );
    if (!torneio) return { ok: false, motivo: 'JA_EXECUTANDO' };

    if (torneio.participantes.length < 2) {
        torneio.fase = 'cancelado';
        await torneio.save();
        // Devolve a inscrição de quem pagou.
        for (const p of torneio.participantes) {
            if (torneio.taxaInscricao > 0) await addBalance(p.id, torneio.taxaInscricao);
        }
        return { ok: false, motivo: 'POUCOS' };
    }

    let vivos = embaralhar(torneio.participantes, rng);
    const rodadas = [];
    let numeroRodada = 0;

    while (vivos.length > 1) {
        numeroRodada++;
        const confrontos = [];
        const proximaRodada = [];

        for (let i = 0; i < vivos.length; i += 2) {
            const a = vivos[i];
            const b = vivos[i + 1];

            // Ímpar: o último passa direto.
            if (!b) {
                proximaRodada.push(a);
                confrontos.push({
                    aId: a.id, aNome: a.username,
                    bId: null, bNome: null,
                    // 'BYE' é código, não texto de tela: o placar fica no
                    // banco e pode ser exibido meses depois, em outro idioma.
                    vencedorId: a.id, placar: 'BYE'
                });
                continue;
            }

            // Empate no 3v3 não existe: são três confrontos, cada um com
            // um vencedor, então o placar é sempre 2x1 ou 3x0.
            const resultado = runBattle(a.deck, b.deck, rng);
            const vencedor = resultado.winner === 'X' ? a : b;

            proximaRodada.push(vencedor);
            confrontos.push({
                aId: a.id, aNome: a.username,
                bId: b.id, bNome: b.username,
                vencedorId: vencedor.id,
                placar: `${resultado.winsX} x ${resultado.winsY}`
            });
        }

        rodadas.push({ numero: numeroRodada, confrontos });
        vivos = proximaRodada;
    }

    const campeao = vivos[0];

    torneio.rodadas = rodadas;
    torneio.rodadaAtual = numeroRodada;
    torneio.campeaoId = campeao.id;
    torneio.fase = 'concluido';
    await torneio.save();

    if (torneio.premio > 0) {
        await addBalance(campeao.id, torneio.premio);
    }
    await User.updateOne({ id: campeao.id }, { $inc: { 'stats.torneiosVencidos': 1 } });

    return { ok: true, torneio, campeao, rodadas };
}

async function cancelar(tournamentId) {
    const torneio = await buscar(tournamentId);
    if (!torneio || torneio.fase === 'concluido') return null;

    // Devolve as inscrições.
    if (torneio.taxaInscricao > 0) {
        for (const p of torneio.participantes) {
            await addBalance(p.id, torneio.taxaInscricao);
        }
    }
    torneio.fase = 'cancelado';
    await torneio.save();
    return torneio;
}

/**
 * Cancela torneios travados, devolvendo as taxas.
 *
 * Dois casos, com prazos diferentes:
 *
 * - `inscricoes` parada há mais de uma hora: ninguém vai começar mais.
 * - `emandamento` há mais de cinco minutos: impossível, a execução leva
 *   segundos. Significa que o bot caiu no meio. Antes essa fase não era
 *   varrida, e um crash durante a execução travava o servidor para
 *   sempre — nenhum torneio novo podia ser criado, e não havia botão
 *   para cancelar porque a mensagem antiga já tinha sido substituída
 *   pelo "deferUpdate" da execução.
 */
async function limparAbandonados() {
    const agora = Date.now();
    const travados = await Tournament.find({
        $or: [
            { fase: 'inscricoes', criadoEm: { $lt: new Date(agora - TTL_MS) } },
            { fase: 'emandamento', criadoEm: { $lt: new Date(agora - TTL_EXECUCAO_MS) } }
        ]
    });

    for (const t of travados) {
        await cancelar(t.tournamentId);
    }
    return travados.length;
}

/** Nome da rodada conforme quantos participantes restam. */
function nomeRodada(quantosNaRodada, locale = DEFAULT_LOCALE) {
    if (quantosNaRodada <= 2) return traduzir(locale, 'torneio.rodada_final');
    if (quantosNaRodada <= 4) return traduzir(locale, 'torneio.rodada_semi');
    if (quantosNaRodada <= 8) return traduzir(locale, 'torneio.rodada_quartas');
    if (quantosNaRodada <= 16) return traduzir(locale, 'torneio.rodada_oitavas');
    return traduzir(locale, 'torneio.rodada_de', { n: quantosNaRodada });
}

/** Placar de um confronto, já em texto. 'BYE' vira "passou direto". */
function placarTexto(placar, locale = DEFAULT_LOCALE) {
    return placar === 'BYE' ? traduzir(locale, 'torneio.passou_direto') : placar;
}

module.exports = {
    VAGAS_VALIDAS,
    TTL_MS,
    TTL_EXECUCAO_MS,
    gerarId,
    ativoNoServidor,
    buscar,
    criar,
    jaInscrito,
    inscrever,
    desinscrever,
    executar,
    cancelar,
    limparAbandonados,
    nomeRodada,
    placarTexto,
    embaralhar
};
