/**
 * Monitoramento de erros.
 *
 * Sem isto, você só descobre que o bot quebrou quando um jogador reclama.
 * Com isto, você recebe o erro com contexto (qual comando, qual usuário,
 * qual servidor) no momento em que acontece.
 *
 * O Sentry é opcional de propósito: se a dependência não estiver instalada
 * ou o DSN não estiver configurado, tudo continua funcionando e os erros
 * caem no console como antes. Monitoramento nunca pode ser motivo de o bot
 * não subir.
 *
 * Para ligar:
 *   npm install @sentry/node
 *   SENTRY_DSN=https://...  no .env
 */

let Sentry = null;
let ativo = false;

function iniciar() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        console.log('Monitoramento: Sentry desligado (SENTRY_DSN não definido). Erros vão só para o console.');
        return false;
    }

    try {
        Sentry = require('@sentry/node');
    } catch (err) {
        console.warn('Monitoramento: SENTRY_DSN definido, mas @sentry/node não está instalado. Rode: npm install @sentry/node');
        return false;
    }

    try {
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV || 'production',
            // Amostragem de performance baixa: o volume de comando é alto e
            // o plano gratuito tem cota. Erros são sempre enviados.
            tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE) || 0.05,
            beforeSend(evento) {
                // Nunca mandar segredo para fora, mesmo por acidente.
                if (evento.extra) {
                    for (const chave of Object.keys(evento.extra)) {
                        if (/token|secret|senha|password|uri|dsn/i.test(chave)) {
                            evento.extra[chave] = '[removido]';
                        }
                    }
                }
                return evento;
            }
        });
        ativo = true;
        console.log('Monitoramento: Sentry ativo.');
        return true;
    } catch (err) {
        console.warn('Monitoramento: falha ao iniciar o Sentry:', err.message);
        return false;
    }
}

/**
 * Registra um erro, com contexto opcional.
 * Sempre imprime no console — o Sentry é um extra, não um substituto.
 */
function capturarErro(erro, contexto = {}) {
    console.error(contexto.origem ? `[${contexto.origem}]` : '[erro]', erro);

    if (!ativo || !Sentry) return;

    try {
        Sentry.withScope((scope) => {
            if (contexto.comando) scope.setTag('comando', contexto.comando);
            if (contexto.usuarioId) scope.setUser({ id: contexto.usuarioId });
            if (contexto.guildId) scope.setTag('guild', contexto.guildId);
            if (contexto.origem) scope.setTag('origem', contexto.origem);
            for (const [chave, valor] of Object.entries(contexto.extra || {})) {
                scope.setExtra(chave, valor);
            }
            Sentry.captureException(erro);
        });
    } catch (err) {
        console.error('Falha ao enviar erro para o Sentry:', err.message);
    }
}

/** Mensagem informativa (não é erro), útil para eventos raros importantes. */
function capturarAviso(mensagem, contexto = {}) {
    console.warn('[aviso]', mensagem);
    if (!ativo || !Sentry) return;
    try {
        Sentry.captureMessage(mensagem, { level: 'warning', tags: contexto });
    } catch (err) { /* ignora */ }
}

/** Espera o envio dos eventos pendentes antes do processo morrer. */
async function encerrar(ms = 2000) {
    if (!ativo || !Sentry) return;
    try {
        await Sentry.close(ms);
    } catch (err) { /* ignora */ }
}

module.exports = { iniciar, capturarErro, capturarAviso, encerrar, estaAtivo: () => ativo };
