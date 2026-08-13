# AniBattle

Bot de Discord para colecionar e batalhar com cartas de personagens de anime. Rolagem com raridades, inventário, Pokédex, mercado entre jogadores, duelos 3v3 com aposta e assinaturas VIP cosméticas.

## Como funciona

Cada carta é uma imagem gerada em tempo real com `canvas` — o fundo, a moldura da raridade, o badge de overall e os atributos são todos desenhados por código. Não é preciso hospedar arte de fundo; só a imagem do personagem.

O combate é 3v3: cada jogador escolhe 3 cartas e elas se enfrentam na ordem escolhida. Dentro de cada confronto existe dano variável, crítico, esquiva e um "modo desespero" abaixo de 40% de vida. Os números foram calibrados por simulação para que cartas melhores ganhem com folga sem que o resultado fique óbvio — cartas da mesma raridade ficam em 50%, uma raridade acima vence entre 68% e 89%.

## Requisitos

- Node.js 18+
- MongoDB (Atlas M0 gratuito serve para começar)
- `canvas` compila código nativo; em Linux pode ser preciso instalar as dependências de build listadas na [documentação do node-canvas](https://github.com/Automattic/node-canvas#compiling)

## Instalação

```bash
git clone git@github.com:avilaa03/bot_animefight.git
cd bot_animefight
npm install
cp .env.exemple .env    # preencha os valores
npm run check:db        # confirme que o banco responde antes de subir o bot
npm run dev
```

## Testando a conexão com o banco

```bash
npm run check:db
```

Esse é o primeiro comando a rodar sempre que algo parecer errado — comandos voltando vazios, cartas sumindo, bot não subindo. Ele conecta, mede a latência, lista as coleções com a contagem de documentos, confere se o catálogo tem carta de cada raridade, testa se a escrita funciona e verifica os índices.

Ele também traduz os erros mais comuns do Atlas, que por padrão vêm crípticos:

| O que aparece | O que significa |
|---|---|
| `Authentication failed` | Usuário ou senha errados. Se a senha tem `@ : / ? #`, ela precisa estar em percent-encoding na URI (`p@ss` vira `p%40ss`) |
| `IP isn't whitelisted` / timeout | O IP da máquina não está liberado. Atlas → Network Access → Add IP Address |
| `EAI_AGAIN` / `querySrv` | Host errado na URI, ou problema de DNS/internet |
| Conectado ao banco `test` | A URI está sem o nome do banco antes do `?`. Foi o que já quebrou o `/roll` uma vez |
| Escrita falhou | O usuário do banco é somente-leitura. Atlas → Database Access → "Read and write to any database" |

Saída de um banco saudável:

```
✅ Conectado em 84ms
   Banco: AnimeFightDB
   Latência: 41ms (🟢 ótima)

📦 Coleções:
   ✓ new-cards        1000 doc(s)  — catálogo de cartas
   ✓ users               12 doc(s)  — jogadores
   ...

🎴 Catálogo por raridade:
   ✓ common         500
   ✓ rare           270
   ...

✍️  Escrita: ✅ funcionando
```

### Variáveis de ambiente

| Variável | Obrigatória | O que faz |
|---|---|---|
| `TOKEN` | sim | Token do bot no Discord |
| `CLIENT_ID` | sim | ID da aplicação no Discord |
| `MONGODB_URI` | sim | **Inclua o nome do banco no caminho** (`.../mongodb.net/AnimeFightDB?...`), senão o driver cai no banco `test` e tudo vem vazio |
| `ROLL_COOLDOWN_MS` | não | Espera entre rolagens (padrão 15 min) |
| `MARKET_TAX_RATE` | não | Taxa do mercado, padrão `0.05` (5%). Essa moeda é destruída — é o freio da inflação |
| `MIN_WAGER` | não | Aposta mínima em batalha (padrão 10) |
| `BATTLE_COOLDOWN_MS` | não | Intervalo entre duelos do mesmo par (padrão 60s) |
| `BATTLE_TTL_MS` | não | Quando uma batalha parada é abandonada e as apostas voltam (padrão 30 min) |
| `PAYMENT_WEBHOOK_SECRET` | não | Segredo do webhook de pagamento. **Sem ele o endpoint fica desligado** |
| `LOJA_URL` | não | Link do botão "Assinar" no `/vip` |
| `SENTRY_DSN` | não | Liga o monitoramento de erros |
| `CARD_GIF_*` | não | Ajustes das cartas animadas (quadros, largura, tempo) |

## Scripts

```bash
npm run dev                 # sobe o bot
npm run check:db            # testa a conexão com o banco (rode este primeiro se algo estiver estranho)
npm test                    # testes (não precisam de banco)

npm run import:anilist -- --pages 20      # busca personagens no AniList e gera um JSON
npm run seed:cards <arquivo.json>          # importa o JSON para o catálogo
npm run preview:cards                      # renderiza cartas em PNG local
npm run preview:cards -- --molduras        # renderiza cada moldura, medindo peso e tempo

npm run migrate:dex         # numera as cartas do catálogo (rode uma vez)
npm run migrate:pokedex     # preenche a Pokédex de quem já tinha cartas
npm run vip:grant -- --user <id> --tier ouro    # ativa VIP manualmente (PIX na mão)
npm run vip:grant -- --user <id> --revogar

npm run codigos:gerar -- --vip ouro --meses 3   # gera código para o comprador ativar com /redeem
npm run codigos:gerar -- --moedas 5000 --usos 200 --validade 30
npm run codigos:gerar -- --listar               # códigos abertos e resgates travados
npm run codigos:gerar -- --cancelar ANI-0000-0000-0000

npm run backup              # exporta todas as coleções para backups/
npm run restore -- --de backups/<pasta>    # simula; use --confirmar para executar
```

## Ferramentas de administração

> **Tudo que está aqui também existe no painel web**, em `/admin/jogadores` do
> [projeto do site](../anibattle-site). O painel tem confirmação, mostra o
> estado antes e depois, e grava tudo num log de auditoria — prefira ele para
> o dia a dia. Os scripts abaixo continuam sendo o caminho certo para
> **operação em massa** e para quando o site estiver fora do ar.

Todas recebem `--user <id do Discord>`. Para copiar um ID: Discord → Configurações → Avançado → Modo desenvolvedor, depois botão direito no usuário → Copiar ID.

### Banir e desbanir

Isso **só existe no painel web** (`/admin/jogadores/<id>` → Moderação), porque
banimento pede motivo registrado e rastro de quem aplicou.

Do lado do bot, o que existe é a leitura, em `Commands/utils/moderacao.js`:

- Um jogador banido é bloqueado em **todos** os comandos e botões, com um aviso
  dizendo o motivo e o prazo. A checagem fica no `interactionCreate`, antes de
  qualquer despacho — se estivesse dentro de cada comando, bastaria esquecer de
  um para o banido continuar jogando por ele.
- O veredito fica **30 segundos em cache**. Sem isso seria uma consulta ao Mongo
  por clique, para um campo que quase nunca muda. Consequência aceita: banir e
  desbanir demoram até meio minuto para valer.
- **Banco fora do ar não bane ninguém.** Se a consulta falhar, o jogador passa.
  Errar liberando é incômodo; errar bloqueando derruba o jogo inteiro numa
  queda do Atlas.
- Banimento com prazo vencido se apaga sozinho na primeira consulta depois do
  vencimento. Não precisa de rotina agendada.

### Dar (ou tirar) cartas

```bash
npm run cards:grant -- --user <id> --carta "Kirito"
npm run cards:grant -- --user <id> --raridade master --quantidade 3
npm run cards:grant -- --user <id> --serie "Naruto" --quantidade 5
npm run cards:grant -- --user <id> --id 673359c5a5aca0fd5877e974
npm run cards:grant -- --user <id> --carta "Kirito" --remover
```

A carta entregue é idêntica à que o `/roll` geraria — mesmos campos, mesmo cálculo de valor — e entra na Pokédex normalmente. Use `--sem-pokedex` se quiser dar a carta sem marcar a descoberta. Acima de 25 cartas de uma vez, o script exige `--confirmar`.

Remover cartas **não** apaga a descoberta na Pokédex, porque descoberta é permanente por design (igual a Pokémon: soltar o bicho não apaga o registro).

### Destravar torneios

Cada servidor só pode ter um torneio aberto por vez. Normalmente você cancela pelo botão dentro do Discord — se rodar `/torneio` com um já aberto, a resposta traz o link para a mensagem dele e o botão de cancelar (para quem criou ou quem tem **Gerenciar servidor**).

Quando isso não resolve (mensagem apagada, bot fora do ar):

```bash
npm run torneios:limpar                    # só lista o que está aberto
npm run torneios:limpar -- --id tn1a2b3c   # cancela um
npm run torneios:limpar -- --tudo          # cancela todos
```

Cancelar devolve a taxa de inscrição de quem pagou.

O bot também varre sozinho a cada 5 minutos: inscrição parada há mais de 1 hora, e execução travada há mais de 5 minutos (a execução leva segundos — se passou disso, o bot caiu no meio dela).

### Testando torneio sozinho

Não dá: o torneio precisa de **pelo menos 2 participantes**, cada um com **3 cartas ou mais**. Com um inscrito só, começar devolve as inscrições e cancela.

Para testar, chame alguém ou use uma segunda conta do Discord, e adiante o inventário dela:

```bash
npm run cards:grant -- --user <id da segunda conta> --raridade rare --quantidade 3
```

### Completar a Pokédex sem dar as cartas

```bash
npm run pokedex:grant -- --user <id> --carta "Kirito"
npm run pokedex:grant -- --user <id> --raridade master
npm run pokedex:grant -- --user <id> --serie "Naruto"
npm run pokedex:grant -- --user <id> --tudo --confirmar     # Pokédex 100%
npm run pokedex:grant -- --user <id> --limpar --confirmar   # zera a Pokédex
```

O jogador passa a ver a carta na `/pokedex` e ela conta no progresso e no ranking de colecionadores, mas **não recebe a carta** — não pode usar em batalha nem vender. Útil para corrigir Pokédex desatualizada ou premiar evento sem inflar a economia.

`--tudo` e `--limpar` só simulam sem `--confirmar`, e o script mostra o progresso antes e depois:

```
Pokédex antes: 42 / 1000  [█░░░░░░░░░░░░░░░░░░░] 4.2%
Cartas no filtro: 20
Já descobertas:   3
A marcar:         17
✓ 17 carta(s) marcada(s) como descoberta(s).
Pokédex depois: 59 / 1000  [█░░░░░░░░░░░░░░░░░░░] 5.9%
```

## Estrutura

```
Commands/
  commands/    definição dos slash commands (o que aparece no Discord)
  actions/
    run/       o que o comando faz
    collect/   tratamento de botões e menus
    end/       o que acontece quando o tempo expira
  handlers/    botões que vivem fora de um coletor (escolha de time na batalha)
  utils/       schemas do Mongo e as regras compartilhadas
scripts/       manutenção e conteúdo (importação, backup, preview)
tests/         testes que rodam sem banco
```

### Onde ficam as regras importantes

| Arquivo | Responsabilidade |
|---|---|
| `utils/embeds.js` | Identidade visual. **Todo embed passa por aqui** — não use `new EmbedBuilder` direto |
| `utils/cardRenderer.js` | Decide entre PNG e GIF. **Não chame `CardBuilder` direto nos comandos** |
| `utils/battleEngine.js` | Motor de combate. Não conhece VIP, de propósito |
| `utils/battleState.js` | Batalhas persistidas, com devolução de aposta em caso de queda |
| `utils/economy.js` | Débito/crédito atômico e taxa do mercado |
| `utils/vip.js` | Planos e cosméticos. **Nada aqui pode dar vantagem de combate** |
| `utils/rewards.js` | O que um código pode entregar. **Tipo novo entra numa entrada só** |
| `utils/redeem.js` | Geração e resgate de código. A trava é o índice `(codigo, userId)` |
| `utils/discovery.js` | Pokédex |
| `utils/moderacao.js` | Leitura do banimento. **O porteiro fica no `interactionCreate`**, não dentro dos comandos |
| `utils/presenca.js` | Publica servidores e sinal de vida na coleção `bot_status`, para o painel do site ler |

### Convenções verificadas por teste

`tests/convencoes.test.js` varre o código-fonte e falha se alguma destas regras for quebrada. Todas existem porque o bug já aconteceu:

| Regra | O que quebrou quando foi violada |
|---|---|
| `require` tem que usar a caixa exata do nome no disco | `require('./commands/...')` com c minúsculo. O macOS abre o mesmo arquivo, mas o Node cacheia módulo pela string do caminho — a árvore inteira carregava **duas vezes**, com estado duplicado, e o `/torneio` morria com "Cannot overwrite `Card` model once compiled". Em Linux o bot nem sobe |
| Schema usa `mongoose.models.X \|\| mongoose.model(...)` | Rede de segurança do mesmo problema |
| Nada usa `ephemeral:` | Depreciado no discord.js, some na v15. O certo é `flags: MessageFlags.Ephemeral` |
| Quem usa `MessageFlags` importa `MessageFlags` | Erro que só aparece quando aquele caminho do código roda — pode levar meses |
| Embed só nasce em `utils/embeds.js` | Comando fugindo do padrão de cor, emoji e rodapé |

Cada verificação foi validada reintroduzindo o bug de propósito e conferindo que o teste falha. Teste que nunca viu o erro que promete pegar não prova nada.

## Decisões que valem conhecer antes de mexer

**Nenhum plano pago dá vantagem de combate.** Existe teste que falha se alguém adicionar um campo de combate a um plano. Isso não é preciosismo: moeda comprada virando poder numa batalha com aposta cria um problema regulatório, além de esvaziar a base gratuita.

**Nenhum intent privilegiado.** O bot já usou `MessageContent`; hoje tudo é botão e menu de seleção. Manter assim evita a aprovação que o Discord exige acima de 10.000 usuários — pense duas vezes antes de reintroduzir coletor de mensagem.

**Operações de moeda são atômicas.** Use `trySpend`/`addBalance` de `utils/economy.js`, nunca leia-modifique-salve um documento inteiro; isso duplicava moedas com cliques simultâneos.

**A economia tem inflação estrutural.** O `/roll` gera cerca de 24.800 moedas por jogador por dia e a taxa do mercado destrói apenas ~1% disso. Se os preços dispararem, o lugar de mexer é o valor da venda rápida ou o cooldown, não a taxa.

## Antes de abrir ao público

- [ ] Rodar `npm run check:db` e confirmar que está tudo verde
- [ ] Trocar a senha do MongoDB por uma forte e restringir o IP allowlist do Atlas
- [ ] Regenerar o token do Discord se ele já circulou em algum lugar
- [ ] Configurar `npm run backup` num cron diário, com cópia fora do servidor
- [ ] Testar `npm run restore` pelo menos uma vez (backup não testado não é backup)
- [ ] Preencher os campos `[...]` em `PRIVACIDADE.md` e `TERMOS.md` e publicá-los
- [ ] Rodar `npm run migrate:dex` (numera o catálogo — a `/ficha` depende disso)
- [ ] Rodar `npm run migrate:pokedex`
- [ ] Medir as cartas animadas com `npm run preview:cards -- --molduras`
- [ ] Configurar `SENTRY_DSN`
- [ ] Rodar com PM2 ou systemd, para reiniciar sozinho

## Documentos

- [PLANO-BETA.md](PLANO-BETA.md) — **comece por aqui**: o que falta para lançar, decisões pendentes e fila de features
- [Política de Privacidade](PRIVACIDADE.md)
- [Termos de Uso](TERMOS.md)
- [ROADMAP.md](ROADMAP.md) — histórico de decisões técnicas

## Aviso legal

Projeto de fã, sem vínculo com os detentores dos direitos das obras retratadas. Nomes e imagens de personagens pertencem aos seus criadores e distribuidoras.

## Licença

MIT — veja `package.json`.
