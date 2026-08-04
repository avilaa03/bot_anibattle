# Deploy automático

Push na `main` → GitHub roda os testes → se passarem, entra na VPS por SSH, traz o código novo e reconstrói o contêiner. Se o bot não conectar em 90 segundos, volta sozinho para a versão anterior.

Push na `develop` só roda os testes. Produção não é tocada.

## Como funciona

```
git push origin main
        │
        ▼
  [ testes ]  npm ci + npm test          ← falhou aqui, para tudo
        │
        ▼
 [ implantar ]  ssh VPS < deploy/implantar.sh
        │
        ├─ git reset --hard origin/main
        ├─ docker compose up -d --build
        ├─ espera "O bot está pronto" no log
        └─ não veio? volta o commit anterior e reconstrói
```

Dois arquivos:

| Arquivo | O que é |
|---|---|
| `.github/workflows/ci-cd.yml` | Quando roda e com quais segredos |
| `deploy/implantar.sh` | O que acontece dentro da VPS |

A lógica de deploy fica no script, não no YAML, para você conseguir rodar o mesmo passo a passo na mão quando precisar depurar.

---

## Configuração (uma vez só)

### 1. Renomear `master` para `main`

Este repositório ainda usa `master`; o do site usa `main`. Padronizar evita errar o nome toda vez.

```bash
git branch -m master main
git push -u origin main
```

Depois, no GitHub: **Settings → General → Default branch** → trocar para `main`. Aí dá para apagar a antiga:

```bash
git push origin --delete master
```

### 2. Criar a `develop`

```bash
git checkout -b develop
git push -u origin develop
```

Daqui em diante: você trabalha na `develop`, e quando estiver pronto abre um Pull Request para a `main`. O merge do PR é o que publica.

### 3. Gerar a chave SSH de deploy

**Na sua máquina.** É uma chave só para o GitHub — não reaproveite a sua pessoal, porque assim dá para revogar o acesso do GitHub sem perder o seu.

```bash
ssh-keygen -t ed25519 -C "github-actions-anibattle" -f ~/.ssh/anibattle_deploy -N ""
```

Isso cria dois arquivos: `anibattle_deploy` (privada) e `anibattle_deploy.pub` (pública).

Instale a pública na VPS:

```bash
ssh-copy-id -i ~/.ssh/anibattle_deploy.pub root@SEU_IP
```

Teste antes de seguir — se isso não entrar sem pedir senha, o deploy também não vai:

```bash
ssh -i ~/.ssh/anibattle_deploy root@SEU_IP "echo funcionou"
```

### 4. Cadastrar os secrets no GitHub

**Settings → Secrets and variables → Actions → New repository secret.**

| Secret | Valor | Como obter |
|---|---|---|
| `VPS_HOST` | IP da VPS | hPanel → VPS |
| `VPS_USER` | `root` | ou outro usuário, se você criou |
| `VPS_SSH_KEY` | conteúdo da chave **privada** | `cat ~/.ssh/anibattle_deploy` — copie tudo, inclusive as linhas `BEGIN`/`END` |
| `DEPLOY_DIR` | caminho do projeto na VPS | `pwd` dentro da pasta, algo como `/root/bot_animefight` |
| `VPS_PORT` | opcional | só se o SSH não estiver na 22 |

O mesmo precisa ser cadastrado nos **dois repositórios** — secrets não são compartilhados entre repos.

### 5. Preparar a VPS

O deploy faz `git fetch`, então a pasta na VPS precisa ser um clone com acesso de leitura ao GitHub:

```bash
cd /caminho/do/bot_animefight
git remote -v          # tem que apontar para o seu repositório
git fetch origin       # tem que funcionar sem pedir senha
```

Se pedir senha, o clone está por HTTPS num repositório privado. Troque para SSH e cadastre uma deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# cole em: GitHub → repositório → Settings → Deploy keys → Add
git remote set-url origin git@github.com:avilaa03/bot_animefight.git
git fetch origin
```

Confirme também que o `.env` está lá:

```bash
ls -la /caminho/do/bot_animefight/.env
```

> O `.env` **não vem do Git** — está no `.gitignore` de propósito, porque guarda o token do Discord e a senha do Mongo. Ele vive só na VPS. O script de deploy nunca o apaga (por isso não usa `git clean`), mas se você recriar a VPS terá que recolocá-lo à mão.

### 6. Testar

Na aba **Actions** do GitHub, escolha o workflow **Testes e deploy** → **Run workflow**. Isso dispara o deploy sem precisar de commit.

Acompanhe o log do passo "Rodar o deploy na VPS" — ele mostra os dois commits, a construção e a espera pelo bot.

---

## O dia a dia

```bash
git checkout develop
# ... trabalha, commita ...
git push origin develop        # roda só os testes

# quando estiver bom:
# abra um PR develop → main no GitHub e faça o merge
```

Para publicar sem passar por PR (evite, mas existe):

```bash
git checkout main && git merge develop && git push origin main
```

## Quando der errado

**Os testes falharam.** Nada foi para produção. Veja qual quebrou no log do Actions e corrija na `develop`.

**O deploy reverteu.** O bot voltou para a versão anterior e continua no ar. O log do Actions traz as últimas 40 linhas do contêiner — quase sempre é variável de ambiente faltando ou erro em código que só aparece com banco de verdade.

**Ficou tudo fora do ar.** Entre na VPS e olhe direto:

```bash
cd /caminho/do/bot_animefight
docker compose logs --tail 100 bot
docker compose up -d --build          # tenta de novo
```

**Voltar para um commit específico:**

```bash
cd /caminho/do/bot_animefight
git reset --hard <sha>
docker compose up -d --build
```

## Coisas que valem saber

**A construção acontece na VPS.** Numa Hostinger pequena, o `docker compose up --build` consome CPU por alguns minutos e o bot fica fora do ar nesse intervalo. Se isso incomodar quando você tiver jogadores de verdade, o próximo passo é construir a imagem no próprio GitHub e publicá-la no GHCR — a VPS só baixaria a imagem pronta, e o deploy cairia para segundos.

**O `ssh-keyscan` do workflow confia no servidor na hora da conexão.** Para endurecer, rode `ssh-keyscan -H SEU_IP` na sua máquina, salve a saída num secret `VPS_KNOWN_HOSTS` e troque aquele bloco no YAML — o comentário no arquivo explica onde.

**Migrações de banco não rodam sozinhas.** `npm run migrate:dex` e `migrate:pokedex` continuam manuais, de propósito: alteração em massa no banco não deve acontecer como efeito colateral de um `git push`.
