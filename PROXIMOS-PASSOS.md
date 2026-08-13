# Próximos passos — AniBattle

*Escrito em 13/08/2026, ao fim da sessão que entregou as vantagens novas de VIP e o sistema de códigos de resgate.*

Este arquivo é o **handoff**: leia-o antes de começar qualquer coisa. Ele diz o que acabou de mudar, o que está pronto para usar, e o que vem depois — com as decisões já tomadas e o motivo delas, para não serem redecididas do zero.

---

## 1. Onde o projeto está

Dois repositórios, mesmo banco MongoDB, mesma VPS:

```
bot_anibattle       (Discord, Node + Mongoose, Docker, Node 18.12.1)
bot-anibattle-web   (Next.js, driver nativo do Mongo, porta 3000)
```

O jogo está **pronto**: 39 comandos, i18n em 3 idiomas (pt-BR, en-US, es-ES), telemetria, moderação, ELO, torneios, missões, conquistas, bolsa, aprimoramento, loja, caixas, cartas de evento, painel admin com auditoria.

O que falta **não é código de jogo** — é operação, monetização e aquisição.

### Como verificar que está tudo são

```bash
# no bot
node tests/run.js            # 31 arquivos, tudo deve passar

# no site
npx tsc --noEmit -p tsconfig.check.json
npm run idiomas:conferir     # 3 dicionários com as mesmas chaves
npm run vip:conferir         # planos do site == planos do bot
npm run valores:conferir     # preço de carta site == bot
npm run codigos:conferir     # o código gerado no site é aceito no bot
```

**Rode os quatro conferidores antes e depois de mexer em qualquer coisa compartilhada.** Eles existem porque divergência entre site e bot não quebra nada — só faz o site mentir para quem está pagando.

---

## 2. O que mudou nesta sessão

Duas PRs abertas, uma em cada repositório, na branch `feat/vip-e-codigos-de-resgate`.

### VIP passou a vender quantidade e conveniência

| | Bronze R$5 | Prata R$15 | Ouro R$30 | Master R$50 |
|---|---|---|---|---|
| Cooldown | −15% | −25% | −35% | **−45%** |
| Cargas de roll | +1 | +1 | +2 | **+3** |
| Daily | 1,5× | 2× | 2,5× | 3× |
| Rolls extras/dia (no `/daily`) | — | 1 | 2 | **3** |
| Taxa do mercado (base 5%) | 4% | 3% | 1,5% | **isento** |
| Venda rápida | +5% | +10% | +15% | **+20%** |
| Lista de desejos | 25 | 40 | 60 | **100** |

Cosmético ficou como estava — foi decisão do dono deixar para depois.

### Sistema de códigos de resgate, genérico

Um código entrega uma **lista** de recompensas. Tipos em `Commands/utils/rewards.js`: `vip`, `moedas`, `item`, `caixa`, `carta`. Vender algo novo é **uma entrada** nesse catálogo.

```bash
npm run codigos:gerar -- --vip ouro --meses 3
npm run codigos:gerar -- --caixa lendaria --quantidade 3 --moedas 5000
npm run codigos:gerar -- --moedas 500 --usos 200 --validade 30
npm run codigos:gerar -- --listar
```

O jogador ativa com `/redeem code:ANI-XXXX-XXXX-XXXX`. E há a tela `/admin/codigos` no site, que faz o mesmo com mouse e grava tudo na auditoria.

---

## 3. Invariantes — não quebre estes sem ler o porquê

Cada um destes tem teste em cima. Quando um teste falhar, **leia o comentário dele antes de "consertar" o teste**.

**Nenhum plano pago pode dar vantagem de combate.** `tests/vip.test.js` varre os campos de todo tier procurando `ATA`, `LIF`, `POW`, `overall`, `rarity`, `raridade`, `dano`, `critico`, `vitoria`, `battle`, `combate` — e confere que `battleEngine.js` não consegue nem importar `vip.js`. Isso não é preciosismo: `/battle` tem **aposta** de moeda, e dinheiro real comprando vitória em disputa apostada é problema com processadora de pagamento (Stripe e PayPal proíbem negócio adjacente a jogo de azar) e com o Discord, antes de ser problema de equilíbrio.

**A chance de raridade é igual para todo mundo.** Está escrito em `rollRun.js` e é o argumento de venda mais forte contra os concorrentes pay-to-win.

**Dois tetos de economia são constantes travadas**, em `Commands/utils/vip.js`: `LIMITE_COOLDOWN` (−45%) e `LIMITE_BONUS_VENDA` (+20%). São as duas vantagens que geram moeda.

**O bônus de venda rápida nunca é gravado na carta.** `valueToSell` guarda o valor natural; o bônus entra no crédito, via `cardValues.vendaRapidaPara()`. Gravar tornaria o bônus permanente e transferível pelo mercado.

**A taxa do mercado é a de quem VENDE, lida na hora da venda.**

**O resgate mora só no bot.** O site cria códigos, o bot os consome. A trava contra resgate duplo é o índice único `(codigo, userId)` na coleção `resgates` — e trava precisa de dono único.

**Entrega parcial de código não devolve o uso.** Devolver faria o jogador resgatar de novo e receber em dobro o que deu certo. Use `redeem.reprocessar()`.

---

## 4. O que fazer a seguir, em ordem

### 4.1. Validar o fluxo de venda na mão (antes de qualquer código novo)

Não escreva nada até fazer isto uma vez:

1. Gere um código de VIP Bronze de 1 mês pelo `/admin/codigos`.
2. Resgate com uma conta de teste no Discord.
3. Confira: o VIP entrou, o segundo `/redeem` recusa, e "quem usou" mostra o resgate.

Isso prova validação, geração, resgate atômico, entrega e auditoria. Quando o Mercado Pago entrar, a única parte nova é *quem chama* `criarCodigos()`.

### 4.2. Checkout Mercado Pago (~2 dias)

**Decisões já tomadas — não redecidir:**

- **Só Pix no começo.** Taxa ~0,99% contra ~4,98% do cartão à vista, dinheiro na hora, e **sem chargeback** — produto digital é a categoria com mais contestação. Barre cartão com `payment_methods.excluded_payment_types`.
- **Webhook no site, não no bot.** O site já tem domínio e HTTPS; expor o bot é justamente o que o desenho de código evita.
- O `paymentWebhook.js` do bot **fica como está**, para uso futuro.

**O que construir:**

| Arquivo | O quê |
|---|---|
| `lib/produtos.ts` | catálogo do que está à venda → recompensas. **O preço mora aqui, no servidor.** Nunca aceite valor vindo do navegador. |
| `app/api/pagamento/criar/route.ts` | recebe só `produtoId`, cria a Preference com `external_reference` = `pedidoId` gerado, grava pedido `pendente` |
| `app/api/pagamento/webhook/route.ts` | valida assinatura → busca o pagamento na API → se `approved`, chama `criarCodigos()` com `origem: 'mercadopago'` |
| `app/api/pagamento/status/route.ts` | a página de obrigado consulta até o código aparecer |
| `app/[locale]/vip/obrigado/page.tsx` | mostra o código, com botão de copiar |

**As cinco armadilhas:**

1. **Nunca confie no corpo do webhook.** Busque `GET https://api.mercadopago.com/v1/payments/{id}` com o access token e confira `status === 'approved'`.
2. **Valide o `x-signature`.** Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, HMAC-SHA256 com `MP_WEBHOOK_SECRET`, comparado ao `v1` com `timingSafeEqual`.
3. **Não envolva o webhook no `rotaAdmin`** de `lib/admin/guarda.ts` — ele exige cabeçalho `Origin` igual ao host, e o Mercado Pago não manda `Origin`. O webhook precisa do guarda próprio (a assinatura).
4. **Idempotência:** o MP reenvia a cada 15 min. Se já existe código com `referencia === String(pagamento.id)`, devolva o mesmo em vez de gerar outro.
5. **Responda 200 em menos de 22 segundos.**

**Configuração:** aplicação tipo Checkout Pro → `MP_ACCESS_TOKEN` (sem prefixo `NEXT_PUBLIC_`!) e `MP_WEBHOOK_SECRET` no `.env` do site. `NEXT_PUBLIC_SITE_URL` precisa apontar para o domínio real — hoje o `.env.local` local está em `localhost:3001`.

### 4.3. Curadoria de cartas + hospedar as próprias imagens (~2 dias) — **o mais urgente antes de lançar**

São **uma tarefa só**, e fazer nessa ordem economiza semanas.

O problema: `cardBuilder.loadImages()` faz um download remoto do `s4.anilist.co` **a cada renderização** — sem cache, sem timeout, com `catch` silencioso. Isso roda no `/roll`, `/show`, `/inventory`, batalha, mercado e `/ficha`. Hotlink de CDN de terceiro em volume é o que quebra no dia do lançamento, que é quando o volume aparece.

E o catálogo veio do AniList ordenado por favoritos globais (`scripts/importFromAnilist.js`) — a raridade é o rank de popularidade e nada mais. É por isso que tem série que ninguém liga: o gosto global do AniList não é o do público PT-BR.

**Faça o passe único:** curar a lista → baixar e redimensionar só o que ficou → reescrever as URLs no catálogo → cache LRU em memória + timeout no `loadImage`. Hospedar primeiro e curar depois baixa arte que vai ser jogada fora; curar depois do lançamento apaga carta que jogador já tem.

### 4.4. Checklist de operação (algumas horas, e não pode ser pulado)

- [ ] `.env` do bot: `PAYMENT_WEBHOOK_SECRET`, `SENTRY_DSN`, `LOJA_URL` — os três faltando hoje (webhook responde 503, monitoramento desligado, botão "Assinar" não aparece)
- [ ] Cron diário de `npm run backup`, com cópia **fora** do servidor
- [ ] Testar `npm run restore` uma vez — backup não restaurado não é backup
- [ ] `npm run migrate:dex` e `npm run migrate:pokedex`
- [ ] PM2 ou systemd
- [ ] Preencher os campos `[...]` de `PRIVACIDADE.md` e `TERMOS.md` e publicar
- [ ] **Fila de concorrência em volta de `renderCard`** — ver a seção 5

### 4.5. Depois do lançamento

**Top.gg** — barato, e o endpoint de voto é praticamente o mesmo arquivo do webhook de pagamento. A recompensa já tem lugar: `bilhete_roll` na bolsa (item `roll_extra`) e a Caixa do Apoiador, que já existe em `boxes.js` com `preco: null` justamente para isso. Mas listar com 0 servidores rende quase nada — faça **depois** de ter base.

**Passe de temporada** — a maior alavanca de receita que existe, e as peças já estão prontas (`eventSchema`, `missions.js`, `progress.js`, `items.js`, cartas de evento com `distribuivel: false`). Converte melhor que assinatura porque tem prazo, progresso visível, e a pessoa "perde" se não comprar.

**`/profile` renderizado como imagem** — melhor retorno por hora do projeto. `trophyBuilder.js` já prova que o padrão funciona, e print de perfil bonito é divulgação grátis.

**Combate** — o de maior esforço e maior risco. Deixe por último, e **resolva antes a decisão pendente do `PLANO-EVOLUCAO.md` Fase 2** (bônus de aprimoramento percentual vs. divisão por ELO), senão você balanceia duas vezes.

---

## 5. Problemas conhecidos que ninguém consertou ainda

**`canvas@^2.11.2` não tem prebuild para Node novo.** Em produção o Dockerfile prende `node:18.12.1` e funciona, mas Node 18 está EOL desde abril/2025. Pior: **os testes passam sem canvas** (têm fallback), então uma build quebrada no VPS passa no CI e só aparece com o jogador na frente. Coloque no checklist de deploy um smoke test na máquina de produção: renderizar uma carta de cada raridade.

**Não há fila de concorrência no `renderCard`.** `canvas` é CPU pesada e trava o event loop do Node, que é single-thread. Dez `/roll` simultâneos num VPS pequeno = event loop parado = "Unknown interaction" para todo mundo. Um limitador (teto de 2–4 simultâneos) transforma "o bot morreu" em "a carta demorou 2 segundos". É o item que mais mata bot de carta no dia 1.

**A cópia de carta para o inventário existe em 5 lugares** (`rollCollect`, `marketEnd`, `boxRun`, `scripts/grantCards`, `utils/rewards`). Todas concordam hoje porque todas leem `valores.valoresDaCarta`, mas isso é disciplina, não garantia — a primeira versão do `grantCards` usava `overall * 10` e sujava o acervo em silêncio. Vale consolidar num util só.

**`bot-anibattle-web/.env.local` tem um transcript de terminal colado nas 3 primeiras linhas** (`root@srv1876430:...`). O dotenv ignora porque não tem `=`, então não quebra — mas mostra que a config de produção está sendo editada por copiar-e-colar no nano. É assim que um dia o arquivo vem truncado.

**`/redeem` não tem apelido em português.** Ficou assim porque `COMANDOS` em `commandNames.js` é congelado por teste (é registro histórico dos comandos que já existiam em português, não configuração). Se o dono quiser `/ativar`, o caminho combinado é um mapa novo `COMANDOS_NOVOS` para apelidos de comandos que nunca existiram em português — preserva a intenção do teste e libera o apelido. **Decisão dele, ainda não tomada.**

---

## 6. Convenções que o código exige

`tests/convencoes.test.js` falha se alguma destas for quebrada. Todas existem porque o bug já aconteceu:

- `require` com a caixa exata do nome no disco (`./Commands/...`, C maiúsculo)
- Schema usa `mongoose.models.X || mongoose.model(...)`
- Nada usa `ephemeral:` — o certo é `flags: MessageFlags.Ephemeral`
- Quem usa `MessageFlags` importa `MessageFlags`
- Embed só nasce em `utils/embeds.js`

E mais duas, não travadas por teste mas igualmente firmes:

- **Nenhum texto para o jogador é escrito na mão.** Tudo sai de `Commands/locales/<locale>.json` via `t('chave')`. Chave nova = três dicionários.
- **Número que aparece em texto vem por marcador**, derivado do código. Escrito na frase, ele sobrevive à mudança da regra e vira mentira em silêncio, nos três idiomas de uma vez.

---

## 7. A matemática que orienta as prioridades

Bots de Discord convertem **0,5% a 2%** dos ativos em pagantes.

| Meta mensal | Pagantes a R$ 25 | Usuários ativos necessários |
|---|---|---|
| R$ 1.500 | 60 | 3.000 – 12.000 |
| R$ 5.000 | 200 | 10.000 – 40.000 |

**O gargalo não é o preço do plano nem a taxa do Mercado Pago — é o topo do funil.** Aumentar 20% o preço rende menos que dobrar a base. É por isso que Top.gg, curadoria de cartas e `/profile` bonito são tarefas de receita, não de vaidade.

Sobre impostos: MEI **não** é permitido para desenvolvimento de software/jogos (CNAE 6203-1/00). PF paga até 27,5% via carnê-leão; ME no Simples fica em ~6%. A conta vira quando o faturamento passa de uns R$ 3–5 mil/mês. Confirmar com contador.

---

## 8. Arquivos que valem ler antes de mexer

| Arquivo | Por quê |
|---|---|
| `Commands/utils/vip.js` | os três eixos e os dois tetos de economia |
| `Commands/utils/rewards.js` | o contrato de um tipo de recompensa |
| `Commands/utils/redeem.js` | a ordem das duas reservas, e por que ela importa |
| `Commands/utils/economy.js` | por que a economia precisa de sinks |
| `Commands/utils/cardValues.js` | por que a raridade define a ordem de grandeza |
| `Commands/utils/boxes.js` | por que o preço é derivado, não escrito |
| `PLANO-EVOLUCAO.md` | as decisões de economia e a Fase 2 pendente |
| `ROADMAP.md` | histórico de decisões técnicas |

Os comentários desses arquivos explicam **por que** as coisas são como são. Quando algo parecer estranho ou redundante, é bem provável que exista um parágrafo explicando qual bug aquilo previne.
