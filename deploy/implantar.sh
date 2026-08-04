#!/usr/bin/env bash
#
# Publica a versão da main na VPS.
#
# Roda NA VPS, enviado pelo GitHub Actions via SSH. Também dá para rodar
# na mão, entrando por SSH e executando:
#
#   cd /caminho/do/bot_animefight && bash deploy/implantar.sh
#
# O que ele faz, em ordem:
#   1. guarda o commit atual, para poder voltar
#   2. traz a main do GitHub
#   3. reconstrói e sobe o contêiner
#   4. confere se o bot subiu de verdade
#   5. se não subiu, volta para o commit anterior e reconstrói
#
# set -e faz o script parar no primeiro erro; -u acusa variável não
# definida; -o pipefail impede que um erro no meio de um pipe passe batido.
set -euo pipefail

DIRETORIO="${DEPLOY_DIR:-$(pwd)}"
ESPERA_SEGUNDOS=90
SERVICO="bot"

cd "$DIRETORIO"

# `docker compose` (plugin) é o atual; `docker-compose` é o binário antigo.
# Detectamos para o script funcionar nas duas instalações.
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    echo "❌ Nem 'docker compose' nem 'docker-compose' encontrados nesta VPS."
    exit 1
fi

echo "▶ Diretório: $DIRETORIO"
echo "▶ Compose:   $COMPOSE"

# O .env fica só na VPS (está no .gitignore). Sem ele o contêiner sobe e
# morre reclamando de MONGODB_URI — melhor falhar aqui, com mensagem clara.
if [ ! -f .env ]; then
    echo "❌ Não achei o .env em $DIRETORIO."
    echo "   Ele não vem do Git de propósito: guarda o token do Discord e a senha do banco."
    exit 1
fi

COMMIT_ANTERIOR="$(git rev-parse HEAD)"
echo "▶ Commit atual: ${COMMIT_ANTERIOR:0:7}"

# ---------------------------------------------------------------------
# Atualiza o código
# ---------------------------------------------------------------------
git fetch --prune origin

# `reset --hard` garante que a VPS fique idêntica à main, mesmo que alguém
# tenha editado um arquivo direto no servidor.
#
# NÃO use `git clean` aqui: ele apagaria o .env, que é ignorado pelo Git e
# existe só neste servidor.
git reset --hard origin/main

COMMIT_NOVO="$(git rev-parse HEAD)"
echo "▶ Commit novo:  ${COMMIT_NOVO:0:7}"

if [ "$COMMIT_ANTERIOR" = "$COMMIT_NOVO" ]; then
    echo "▶ Nada mudou no código, mas seguimos: pode ser um deploy manual para reiniciar."
fi

# ---------------------------------------------------------------------
# Sobe
# ---------------------------------------------------------------------
subir() {
    $COMPOSE up -d --build
}

# O bot é considerado no ar quando o contêiner está rodando E o log mostra
# a conexão com o Discord. Só "contêiner rodando" não basta: ele pode estar
# vivo e em laço de reinício por erro de token.
esta_no_ar() {
    local fim=$((SECONDS + ESPERA_SEGUNDOS))
    while [ $SECONDS -lt $fim ]; do
        if $COMPOSE logs --tail 200 "$SERVICO" 2>&1 | grep -q "O bot está pronto"; then
            # Confirma que não morreu logo depois de logar.
            sleep 5
            if [ "$($COMPOSE ps -q "$SERVICO" | wc -l)" -gt 0 ] \
               && docker inspect -f '{{.State.Running}}' "$($COMPOSE ps -q "$SERVICO")" 2>/dev/null | grep -q true; then
                return 0
            fi
        fi
        sleep 3
    done
    return 1
}

echo "▶ Construindo e subindo..."
subir

echo "▶ Esperando o bot conectar (até ${ESPERA_SEGUNDOS}s)..."
if esta_no_ar; then
    echo "✅ Bot no ar em ${COMMIT_NOVO:0:7}."
    # Camadas antigas ocupam disco rápido numa VPS pequena.
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
fi

# ---------------------------------------------------------------------
# Não subiu: volta para a versão anterior
# ---------------------------------------------------------------------
echo "❌ O bot não conectou em ${ESPERA_SEGUNDOS}s. Últimas linhas do log:"
$COMPOSE logs --tail 40 "$SERVICO" 2>&1 || true

if [ "$COMMIT_ANTERIOR" = "$COMMIT_NOVO" ]; then
    echo "❌ Não há versão anterior diferente para voltar. Contêiner deixado como está."
    exit 1
fi

echo "▶ Voltando para ${COMMIT_ANTERIOR:0:7}..."
git reset --hard "$COMMIT_ANTERIOR"
subir

if esta_no_ar; then
    echo "⚠️  Deploy revertido: a versão anterior está no ar."
    echo "    O commit ${COMMIT_NOVO:0:7} NÃO foi publicado. Veja o log acima."
else
    echo "🚨 A versão anterior também não subiu. O bot está fora do ar — entre na VPS."
fi

# Sai com erro para o GitHub marcar o deploy como falho.
exit 1
