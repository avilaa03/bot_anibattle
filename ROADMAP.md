# AniBattle (bot_animefight) — Análise e Roadmap

*Gerado em 02/08/2026 a partir de leitura completa do código-fonte.*

## Atualização (02/08/2026, mesmo dia)

Achado um bug de configuração que explicava o `/roll` não encontrar cartas: `MONGODB_URI` no `.env` não tinha o nome do banco no caminho (`/AnimeFightDB`), então o driver conectava no banco padrão `test`, que está vazio — corrigido. `seriesImage` e `baseImage` do catálogo de cartas deixaram de ser obrigatórios no schema, já que `cardBuilder.js` já lida bem com a ausência deles (o fundo do card é desenhado por código a partir da cor da raridade). Foi criado `scripts/seedCards.js` para importar cartas em massa a partir de um JSON, com stats gerados automaticamente por raridade quando não informados — ver `scripts/cards.example.json` para o formato.

Depois disso apareceu um segundo problema, mais sério: rodar `/roll` derrubava o processo inteiro do bot com `DiscordAPIError[10062]: Unknown interaction`. Duas causas, ambas em `index.js`: (1) `cmd.run(client, interaction)` era chamado sem `await` no handler de `interactionCreate` — qualquer erro dentro de um comando virava uma Promise rejeitada sem tratamento, o que em Node 15+ derruba o processo inteiro em vez de cair no `catch` que já existia logo abaixo; (2) a conexão com o MongoDB só começava dentro do evento `ready` do client, sem ser aguardada — como o bot já aceita interações assim que fica pronto, um `/roll` disparado rápido demais fazia a query no Mongo (antes do `deferReply`) estourar os 3 segundos que o Discord dá pra responder, e o `deferReply` falhava com "Unknown interaction" porque o token da interação já tinha expirado. Corrigido: `index.js` agora conecta no Mongo e aguarda a conexão *antes* de logar no Discord, o `await` foi adicionado, o catch agora sabe responder mesmo quando a interação já foi deferida, e foi adicionado um handler de `unhandledRejection` como rede de segurança para nenhum erro futuro derrubar o bot inteiro de novo.

## Cartas animadas em GIF (02/08/2026)

Molduras de Ouro para cima agora saem como GIF animado em vez de imagem fixa: 🥇 ouro tem um brilho correndo pela borda, 🌸 sakura tem pétalas caindo, 🌈 holográfica tem uma faixa iridescente varrendo, e ⚡ neon pulsa. Bronze e prata continuam estáticas **de propósito** — isso cria um degrau visível entre os planos baratos e o Ouro+, que é exatamente onde está o salto de preço.

O ponto crítico de performance: a carta é renderizada **uma única vez** (arte, texto, moldura de raridade) e cada quadro é só `drawImage(base)` mais o efeito por cima. Sem isso, animar custaria 16× o preço de renderizar uma carta, e a arte do personagem seria baixada 16 vezes. Como o miolo é idêntico entre quadros, o otimizador do encoder também comprime muito melhor.

Três proteções para o efeito cosmético nunca derrubar um comando: o `require('gif-encoder-2')` fica dentro da função (o bot sobe mesmo sem a dependência), há timeout de 8s, e qualquer falha cai silenciosamente para PNG. O jogador vê a carta de qualquer jeito.

Tudo passa por `Commands/utils/cardRenderer.js`, que decide PNG ou GIF e devolve o anexo com o nome de arquivo certo — os comandos não precisam saber se a carta é animada.

**Antes de liberar, medir:** `npm run preview:cards -- --molduras` gera uma carta com cada moldura e reporta peso e tempo de cada uma, com alertas se passar dos limites práticos do Discord. Ajuste `CARD_GIF_FRAMES`, `CARD_GIF_WIDTH` e `CARD_GIF_DELAY_MS` no `.env` conforme o resultado. O GIF já sai a 400×560 em vez de 500×700 justamente para segurar o peso.

Limitação conhecida do formato: GIF só suporta 256 cores, então a arte do personagem fica visivelmente pior que no PNG. É o preço da animação — vale comparar os dois lado a lado no preview antes de decidir.

## Sistema VIP e cosméticos (02/08/2026)

Quatro planos mensais: 🥉 Bronze R$ 5, 🥈 Prata R$ 15, 🥇 Ouro R$ 30, 🌟 Master R$ 50. Vantagens: cooldown do `/roll` de -10% a -40%, daily de 1,25x a 3x, molduras cosméticas de carta, cor de perfil, banner, emblema e destaque em rankings. Comandos `/vip` (vitrine + status) e `/cosmeticos` (equipar).

**A regra que sustenta o desenho: nada aqui dá vantagem de combate.** Atributos, chance de raridade e resultado de batalha são idênticos para todos. Há um teste (`tests/vip.test.js`) que falha de propósito se alguém adicionar um campo de combate a um plano, e que verifica que `battleEngine.js` não importa nada de `vip.js` — o motor não consegue nem enxergar quem é assinante. Isso não é preciosismo: moeda comprada virando poder numa batalha com aposta seria um problema regulatório, não só pay-to-win.

A única vantagem que encosta na economia é a redução de cooldown, porque rolar mais gera mais moeda. Por isso está limitada a -40% e o teste trava esse limite.

**Molduras** são desenhadas no `cardBuilder` por cima da moldura de raridade: bronze/prata/ouro com borda dupla em gradiente, sakura com pétalas nos cantos, holográfica com faixa iridescente e neon com contorno brilhante. Cosméticos ficam salvos mesmo se o VIP expirar — só deixam de ser aplicados, e voltam sozinhos na renovação.

**Pagamento.** `POST /webhook/pagamento` autenticado pelo header `x-webhook-secret` (configure `PAYMENT_WEBHOOK_SECRET`; sem ele o endpoint fica desligado, que é mais seguro do que existir sem senha). Idempotente via `providerPaymentId` — provedores reenviam webhook o tempo todo, e o mesmo pagamento nunca concede duas vezes. Todo pagamento fica registrado na coleção `payments` para auditoria. Renovar antes de expirar acumula os dias restantes em vez de perdê-los.

Para o começo da operação, recebendo PIX na mão, existe `npm run vip:grant -- --user <id> --tier ouro [--meses 3]`, que passa pelo mesmo caminho do webhook (mesma idempotência, mesmo registro). E `--revogar` para estorno.

## Aviso de troféu com imagem (02/08/2026)

Os avisos existiam desde a Fase 1, mas eram todos efêmeros — só o próprio jogador via. Para troféu isso é desperdício: ganhar um raro é momento de se gabar, e ver alguém platinar é justamente o que dá vontade de perseguir os troféus chatos.

A visibilidade agora é por raridade: 🥉 bronze e 🥈 prata continuam privados (são frequentes, anunciar todos encheria o canal e tiraria o valor dos raros), enquanto 🥇 ouro e 💎 platina são **anunciados no canal**, com menção ao jogador. A platina ainda ganha uma mensagem de destaque acima do embed.

`Commands/utils/trophyBuilder.js` desenha o troféu como imagem, no estilo do pop-up da PSN: taça desenhada em canvas (sem asset para hospedar ou quebrar), cor e brilho por tipo, faíscas só nos raros, e selo com pontuação. O objetivo é ser printável — print é divulgação de graça.

Três proteções: `require('canvas')` acontece dentro da função, falha ao gerar imagem cai para o embed de texto, e nada disso pode interromper o comando que disparou o troféu. Há teste que roda mesmo sem canvas instalado, verificando o fallback.

`anunciarConquistas(client, userId, conquistas, canal)` é a versão para quando não há interação disponível — batalha resolvida, torneio e troca usam ela.

## Fase 1: progressão e social (02/08/2026)

Sete sistemas novos, construídos como um bloco só porque dependem da mesma base.

**Base compartilhada.** `Commands/utils/progresso.js` é o ponto único por onde toda ação relevante passa: `registrar(userId, contadores, { eventosMissao })`. Daqui saem os contadores em `User.stats`, o avanço das missões e a checagem de conquistas. Sem isso, cada comando teria que lembrar de atualizar cinco lugares — e esquecer um.

**Conquistas (estilo PSN).** 27 troféus em 🥉 Bronze / 🥈 Prata / 🥇 Ouro, mais a 💎 **Platina**, que segue a regra autêntica da PlayStation: não tem condição própria, desbloqueia sozinha quando todos os outros forem conquistados. Cada tipo vale pontos diferentes e alimenta um nível. Há teste garantindo que faltando **um único** troféu a platina não vem.

**Daily com sequência.** O daily antigo dava 10-100 moedas — 0,2% do que rolar rende no mesmo dia, então ninguém usava. Agora começa em 200 e cresce com a sequência, com marcos multiplicadores em 7, 14, 30, 60 e 100 dias. O valor de um dia isolado continua modesto de propósito: o que prende não é o dinheiro, é não querer perder 20 dias de progresso.

**Troca carta-por-carta** (`/trocar`). Mesa com menu de seleção dos dois lados e confirmação dupla. Duas proteções importantes: mexer na oferta **zera as duas confirmações** (senão daria para confirmar uma coisa e entregar outra), e a execução remove dos dois antes de adicionar em qualquer um — na ordem inversa, uma falha no meio duplicaria carta, e carta duplicada quebra a economia.

**Wishlist** (`/desejar`, `/desejos`). Quando alguém rola uma carta desejada, quem a quer é mencionado no canal. É só aviso: quem rolou mantém prioridade total. A intenção é gerar conversa e movimentar o mercado, não disputa por clique. A `/ficha` agora mostra quantos jogadores procuram cada carta.

**Ranking com ELO** (`/ranking`). Fórmula clássica: ganhar de quem tem muito menos pontos rende quase nada (+3), ganhar de quem tem muito mais rende bastante (+29). Isso desestimula caçar jogador fraco. Seis divisões, de Bronze a Mestre, e piso de 100 pontos para que uma sequência ruim não apague meses de jogo.

**Missões** (`/missoes`). 3 diárias e 2 semanais, sorteadas por jogador de forma estável (o mesmo jogador vê as mesmas o dia inteiro; jogadores diferentes veem missões diferentes). Progresso automático. Há teste verificando que nenhuma missão pede um evento que nenhum comando dispara — senão seria impossível de completar.

**Torneios** (`/torneio`). Eliminatório de 4, 8 ou 16 vagas, com taxa de inscrição opcional que vira prêmio do campeão. O deck é congelado na inscrição (as 3 melhores cartas, automaticamente): resolve o atrito de ter que escolher deck a cada rodada e impede trocar de time depois de ver o adversário. O bot resolve a chave inteira de uma vez.

Testes em `tests/progressao.test.js` cobrem a regra da platina, a curva do ELO, o crescimento do daily e a integridade do catálogo de missões.

## Numeração da Pokédex e comando /ficha (02/08/2026)

Ao criar o comando de consulta apareceu um problema no que já existia: **o número que a `/pokedex` mostrava não era estável.** Ele era a posição na lista filtrada, então `#001` numa busca por série era uma carta diferente de `#001` sem filtro, e todo número mudava quando o catálogo crescia. Um comando que fala "carta #042" precisa que esse 42 signifique sempre a mesma carta.

Correção: o número virou um campo persistido (`numero` em `cardSchema`, com índice único esparso). `Commands/utils/dexNumbers.js` atribui os números pendentes na ordem série → nome, o que agrupa cada anime numa faixa contígua e deixa a dex organizada de ler. **Cartas que já têm número nunca são renumeradas** — cartas novas recebem o próximo número livre e vão para o fim, exatamente como uma nova geração de Pokémon é anexada em vez de embaralhar a numeração. O `seedCards.js` numera sozinho o que importa, e `npm run migrate:dex` fecha qualquer lacuna.

Há teste (`tests/dexNumbers.test.js`) para a propriedade que importa: inserir cartas que *viriam antes* na ordem alfabética não muda nenhum número já atribuído.

**`/ficha`** consulta uma carta registrada na Pokédex, por nome ou por número (`/ficha numero:42`). A diferença para o `/show`: o `/show` lista o que está no inventário **agora**; a `/ficha` mostra qualquer carta que o jogador já teve alguma vez, mesmo vendida — é consulta ao registro, não ao baú. Por isso ela informa também quantas cópias ele possui no momento (pode ser zero) e a data em que registrou.

Se a carta existe mas o jogador não a registrou, o comando avisa e **não revela atributos nem raridade** — senão a graça de descobrir acabaria. Quando a busca por nome traz resultados mistos, mostra os registrados e avisa em mensagem efêmera quantos ficaram de fora.

## Ferramentas de administração (02/08/2026)

`npm run cards:grant` entrega cartas a um jogador com filtro por nome, raridade, série ou id, em quantidade. A cópia gerada é idêntica à do `/roll` — mesmos 15 campos, `marketValue = overall × 10`, `valueToSell` pela metade — e passa pelo mesmo `registerDiscovery`, então a Pokédex reage como se o jogador tivesse rolado. Tem `--remover` para desfazer, `--sem-pokedex` para entregar sem registrar, e exige `--confirmar` acima de 25 cartas. Remover carta **não** apaga a descoberta, porque descoberta é permanente por design.

⚠️ `montarCopia()` em `grantCards.js` duplica a estrutura que `rollCollect.js` monta. Se um mudar, o outro precisa mudar junto, senão carta dada por script fica diferente de carta rolada.

`npm run pokedex:grant` marca cartas como descobertas **sem entregar a carta** — o jogador vê na `/pokedex` e conta no ranking, mas não pode usar em batalha nem vender. Aceita os mesmos filtros, mais `--tudo` (Pokédex completa) e `--limpar` (zera). As duas operações em massa só simulam sem `--confirmar`, e o script mostra o progresso antes e depois.

Nos dois, a validação de argumento acontece **antes** de conectar no banco: erro de digitação falha em ~0,5s em vez de esperar o timeout da conexão.

## Correções pós-teste (02/08/2026)

`/inventory` quebrava com `TypeError: collector.on is not a function`. Causa: `inventoryCollect.js` estava marcado como `async`, então devolvia uma Promise em vez do coletor, e o `collector.on('end', ...)` de quem chamava estourava. O mesmo padrão estava em `favcardCollect.js` (mesma quebra no `/favcard`) e em `marketCollect.js` (latente — o retorno não era usado ainda). Nenhum dos três tinha `await` no nível de topo, então a correção foi remover o `async`.

Também foram substituídos todos os `fetchReply: true`, que o discord.js deprecou e que imprimia aviso a cada comando. Onde era `editReply` bastou remover a opção (esse método já devolve a mensagem); onde era `reply` virou `await interaction.reply(...)` seguido de `await interaction.fetchReply()`.

Existe agora `tests/collectors.test.js` cobrindo essa classe de erro: ele falha se algum módulo de collect voltar a ser `async` devolvendo coletor, se alguma chamada usar o retorno sem `await`, ou se `fetchReply: true` reaparecer. Foi verificado reintroduzindo o bug de propósito — o teste pegou.

## Preparação para beta (02/08/2026)

**Estado de batalha no MongoDB.** Saiu da memória do processo para a coleção `battles` (`Commands/utils/battleSchema.js`). Isso deixou de ser melhoria de arquitetura e virou necessidade quando a aposta passou a ser debitada no aceite: um restart no meio do duelo fazia as moedas retidas sumirem. Agora, no boot, `recoverPendingBattles()` cancela batalhas órfãs e devolve as apostas; um sweeper roda a cada 5 min cancelando duelos abandonados (padrão 30 min, `BATTLE_TTL_MS`). O cooldown por par de jogadores também foi persistido, com expiração automática em 1h.

Três condições de corrida foram fechadas usando o próprio Mongo em vez de código: `addCardToDeck` usa `deckX.2: {$exists:false}` para nunca aceitar uma quarta carta, `$addToSet` para não aceitar a mesma carta duas vezes, e `claimForResolution` faz uma transição `choosing → fighting` condicional, garantindo que dois cliques simultâneos não resolvam (e paguem) a mesma batalha duas vezes. `wagerHeld` marca se as apostas ainda estão retidas, o que impede devolver dinheiro duas vezes.

Há um teste em `tests/battleState.test.js` (`npm test`) que cobre justamente a parte crítica de dinheiro: devolução no restart, não-devolução dupla, limite de 3 cartas, recusa de duplicata, claim único e varredura de abandono. Ele usa um duplo em memória do model, então roda sem banco.

**Intent privilegiado eliminado.** O bot dependia de `MessageContent` em dois lugares: digitar o número da carta no `/market` e digitar "confirmar" no `/give`. Viraram menu de seleção e botões. Com isso `index.js` passou a pedir só `Guilds` e `DirectMessages` — nenhum intent privilegiado — e o bot não precisa passar pela aprovação que o Discord exige acima de 10.000 usuários. `giveCollect.js` e `giveEnd.js` foram removidos (código morto depois da troca).

## Balanceamento, batalha e Pokédex (02/08/2026)

Implementado depois da análise abaixo, com decisão do Lucas:

**Taxa de mercado (sink).** Toda venda no `/market` retém 5% (configurável em `MARKET_TAX_RATE`), e essa moeda é destruída — não vai para ninguém. É o primeiro sink real da economia. Vale registrar o tamanho do efeito: com 100 jogadores e volume estimado de mercado, a taxa destrói ~1% do que o `/roll` cria. Ela ajuda, mas **o gargalo real continua sendo o faucet do `/roll`** (~24.800 moedas/dia por jogador). Se a inflação continuar, o próximo passo é reduzir o valor de venda rápida ou aumentar o cooldown do roll.

**Batalha virou aposta.** Aposta mínima de 10 moedas (`MIN_WAGER`), com opção de propor mais no comando. As duas apostas são debitadas no aceite (escrow) e o vencedor leva o pote inteiro; empate devolve para cada um. Isso transforma a batalha de faucet em transferência — verificado por simulação que a soma de moedas se conserva. Também entrou cooldown de 60s por par de jogadores (`BATTLE_COOLDOWN_MS`) e trava de uma batalha ativa por jogador, fechando o loop de farm entre duas contas.

**Bugs de robustez corrigidos.** Os botões de escolha agora carregam o `_id` da carta em vez do índice do array, então a escolha não "escorrega" se o inventário mudar. E, o mais importante, `validarPosse()` confere no banco se o jogador ainda possui as três cartas **antes de resolver o combate** — antes dava para escolher o time, vender tudo e batalhar mesmo assim. Se faltar carta, a batalha é cancelada e as apostas voltam. O inventário mostrado também passou a ser ordenado por raridade, então quem tem mais de 25 cartas consegue usar as melhores.

**Motor de combate novo.** O anterior era determinístico (quem tinha ATA maior atacava primeiro e o dano era fixo), o que fazia 10% de vantagem virar 93% de vitória. O novo tem dano variável (±45%), crítico, esquiva, ordem de turno probabilística e um "modo desespero" — abaixo de 40% de vida a chance de crítico triplica, o que dá ao azarão uma chance real de virada (e é bem o clichê de anime). Os números foram calibrados por simulação para esta curva:

| | vs common | vs rare | vs ultra | vs legendary | vs master |
|---|---:|---:|---:|---:|---:|
| **common** | 50% | 12% | 2% | 1% | 0% |
| **rare** | 88% | 50% | 21% | 8% | 2% |
| **ultra rare** | 98% | 79% | 51% | 25% | 13% |
| **legendary** | 99% | 92% | 75% | 50% | 33% |
| **master** | 100% | 98% | 88% | 68% | 50% |

Mesma raridade dá moeda ao alto; uma raridade acima vence com folga mas não sempre; e as raridades altas ficam mais próximas entre si, o que mantém o endgame disputado. Num 3v3, um deck legendary ainda perde para um master em 24% das vezes. Também entrou uma trava de 50 turnos — duas cartas com POW 0 travavam o processo do bot em loop infinito.

**Pokédex.** Toda carta que entra no inventário fica registrada para sempre em `User.discovered`; vender não apaga. Comandos novos: `/pokedex` (paginado, com filtro por série, raridade e "só o que falta"; cartas não descobertas aparecem como ⬛ ???) e `/colecionadores` (ranking por descobertas, com a posição do autor mesmo fora do top 10). O progresso também aparece no `/profile`. Para isso ser possível, `marketSchema` ganhou `originalCardId` — o vínculo com o catálogo se perdia quando a carta passava pelo mercado.

⚠️ **Rodar `npm run migrate:pokedex` uma vez** para preencher a Pokédex de quem já tinha cartas antes do sistema existir, e religar anúncios antigos do mercado ao catálogo.

## Análise da economia (02/08/2026)

Números calculados com os valores que estão no código hoje, por jogador ativo por dia:

| Fonte de moeda | Moedas/dia | Observação |
|---|---:|---|
| `/roll` → vender | ~24.800 | 96 rolls/dia (cooldown 15 min) × ~258 de média |
| `/daily` | 55 | 0,22% do que o roll gera |
| `/battle` | ilimitado | sem cooldown; 60 duelos/h entre duas contas = 86.400/dia |

**O problema central é que não existe nenhum sink.** `/market` e `/give` só movem moeda entre jogadores, não destroem. Toda moeda criada fica na economia para sempre. Com 100 jogadores ativos, a projeção é de ~2,5 milhões de moedas em circulação no primeiro dia e ~907 milhões em um ano. A consequência prática é que os preços do mercado perdem o sentido: em poucas semanas qualquer jogador compra qualquer carta sem esforço, e o mercado — que é a parte social mais interessante do bot — morre.

Três correções, em ordem de urgência:

1. **`/battle` sem cooldown é uma impressora de dinheiro.** Dois amigos (ou duas contas do mesmo dono) podem duelar em loop e gerar moeda infinita. Precisa de cooldown por par de jogadores e, idealmente, de aposta: em vez de os dois ganharem, o perdedor paga o vencedor. Isso transforma a batalha de faucet em transferência, que é muito mais saudável.
2. **`/daily` é irrelevante.** Vale 0,22% do que rolar rende — ninguém tem motivo para usar. Ou some, ou vira uma recompensa de sequência (streak) que dá algo que moeda não compra: um roll extra, um item, uma carta garantida de raridade mínima.
3. **Faltam sinks.** Os mais naturais: taxa de ~5% sobre venda no mercado (a moeda some em vez de ir toda pro vendedor), custo para resetar o cooldown do roll, e cosméticos/badges de perfil. Isso é exatamente o que o kakera do Mudae faz — a moeda existe para ser gasta em vantagens, não só acumulada.

Um detalhe: `/give` não tem taxa nem limite, o que facilita farmar com conta alternativa e concentrar tudo numa conta principal. Uma taxa pequena ou um limite diário resolve.

## Análise do sistema de batalha (02/08/2026)

O motor funciona, mas tem um problema de design e dois de robustez.

**Design:** o combate é 100% determinístico. Quem tem ATA maior ataca primeiro e o dano é POW fixo, sem variação, sem tipos, sem habilidades. Na prática, quem tem a soma de atributos maior vence quase sempre, e o jogador percebe isso rápido — a batalha vira uma consulta de tabela, não uma decisão. Existe uma camada estratégica escondida (a ordem em que você escolhe as cartas define os confrontos), mas ela não era comunicada em lugar nenhum; adicionei essa dica na tela de escolha de time e no `/help`. Para ter profundidade de verdade, o caminho mais barato é vantagem de tipo por série/elemento ou uma habilidade passiva por carta.

**Robustez — dois problemas reais:**

O `userXData` guardado no estado da batalha é um retrato do inventário no momento em que o duelo começou, e as cartas são escolhidas por índice nesse array. Se o jogador vender ou negociar uma carta com o duelo em andamento, o índice passa a apontar para outra carta, ou para nada. Pior: **nada verifica se o jogador ainda possui as cartas na hora de resolver a batalha**, então dá para escolher o time, vender as cartas e mesmo assim batalhar com elas. Precisa revalidar a posse antes de resolver o combate.

Só as 25 primeiras cartas do inventário aparecem para escolher (limite de botões do Discord). Quem tiver 200 cartas nunca consegue usar as melhores se elas não estiverem no começo do array. Como o inventário agora é ordenado por raridade no `/inventory`, vale aplicar a mesma ordenação aqui — ou trocar os botões por um menu de seleção com busca.

## Design da carta e pipeline de conteúdo (02/08/2026)

O `cardBuilder.js` foi redesenhado. O problema do visual antigo era o `baseImage` ser desenhado em tela cheia por cima do gradiente a 85% de opacidade e depois receber mais uma camada da cor da raridade a 25% — o resultado era tudo lavado e acinzentado, e a arte do personagem ficava espremida numa caixa de 380x340 esticada sem respeitar proporção. O layout novo trata a arte como protagonista: ela ocupa a carta inteira com recorte que preserva proporção (equivalente ao `object-fit: cover` do CSS, ancorado no topo porque em arte de personagem o rosto quase sempre está em cima), e a legibilidade do texto vem de gradientes escuros (scrim) no topo e na base em vez de lavar a imagem toda. A raridade passou a ser comunicada pela moldura, pelo brilho externo, pelo badge de overall e pela pílula de raridade — não mais pela cor de fundo, que a arte cobre de qualquer forma. Legendary e master ganharam um brilho diagonal sutil. `baseImage` virou cenário opcional atrás do personagem (útil se `characterImage` for PNG recortado), e o logo da série só é desenhado se existir.

Para o cadastro em massa, o gargalo real era o pipeline manual (editar imagem → subir no Imgur → cadastrar no Compass). Foi criado `scripts/importFromAnilist.js`, que busca personagens na API pública do AniList, usa a URL de imagem oficial deles (sem precisar hospedar nada) e **define a raridade automaticamente pela popularidade** — o personagem mais favoritado do site vira master, o menos favoritado vira common, seguindo a mesma lógica do Mudae de "quem é mais famoso vale mais". Os atributos também escalam com a posição no ranking, com variação aleatória para duas cartas da mesma raridade não saírem idênticas. O script gera um JSON para revisão manual (de propósito: dá para tirar personagens indesejados e ajustar raridades antes de qualquer coisa entrar no banco), que depois é importado com `npm run seed:cards`.

Limitação conhecida: as imagens do AniList têm resolução moderada e podem ficar levemente suaves esticadas para 500px de largura. Para as cartas raras que realmente importam, vale substituir por arte de resolução maior manualmente — o campo é o mesmo, só trocar a URL.

O `seedCards.js` foi reescrito para usar `bulkWrite` com upsert em lotes de 500, em vez de um `findOne` + `create` por carta — com um manifesto de ~1000 cartas o jeito anterior faria cerca de 2000 idas ao Atlas. Usa `$setOnInsert`, então reimportar o mesmo arquivo não sobrescreve ajustes manuais feitos no banco. Foi criado também `scripts/previewCards.js` (`npm run preview:cards`), que renderiza cartas reais do banco em PNG local — uma de cada raridade por padrão — para conferir o design sem precisar dar `/roll` no Discord a cada ajuste. Ele também mede o tempo médio de geração e avisa se passar de 3s por carta, que é o ponto onde vale começar a cachear imagem.

### Fluxo completo para popular o catálogo

```
npm run import:anilist -- --pages 20          # gera scripts/cards.anilist.json
# (revise/edite o JSON à vontade aqui)
npm run seed:cards scripts/cards.anilist.json # importa para o MongoDB
npm run preview:cards                         # confere o visual em PNG local
```

## Correções já aplicadas (02/08/2026)

Os problemas técnicos descritos na seção "Problemas técnicos que precisam ser corrigidos antes de crescer" abaixo já foram corrigidos no código: o bug do `currentCollector` compartilhado entre usuários (rollRun.js, favcardRun.js, inventoryRun.js), o `findOne` em estilo callback do rollRun.js, a regex sem sanitização no `/market`, o carregamento de toda a raridade na memória a cada `/roll` (agora usa `$sample`), o cooldown de roll hardcoded (agora lido de `ROLL_COOLDOWN_MS` no `.env`), a falta de atomicidade nas operações de moeda e inventário (give, compra no mercado, venda rápida, venda no mercado, roll) — que agora usam `findOneAndUpdate` com `$inc`/`$push`/`$pull` em vez de ler-modificar-salvar um documento inteiro — e um bug separado encontrado de passagem em `favcardEnd.js` (import faltando, quebrava ao expirar o tempo de escolha). Também foi feita a limpeza de código morto (`OldCommands/`, `TestFiles/`, pasta vazia `a`, handlers comentados e endpoint `/inserir` sem autenticação no `index.js`, dependência `transform-props` não utilizada).

O que **não** foi mexido nesta rodada, por serem decisões de arquitetura maiores (não bugs pontuais): persistência do estado de batalha fora da memória do processo, normalização do inventário (parar de duplicar todos os campos da carta em cada cópia) e cache de imagem de carta gerada em canvas. Continuam descritos nas seções abaixo como trabalho futuro.

## Estado atual

O bot já tem a espinha dorsal de um TCG gacha completo: catálogo de cartas no Mongo (`cardSchema`) com raridade e três atributos de combate (ATA, LIF, POW), sorteio ponderado por raridade em `/roll` com cooldown, geração de imagem de carta em canvas com estilo por raridade, inventário paginado, sistema de batalha 3v3 com escolha de deck via DM e botões, mercado entre jogadores com listagem/compra/remoção, economia com saldo, daily, transferências (`/give`) e ranking (`/magnata`), além de perfil, carta favorita e help paginado. Isso é bem mais do que um protótipo — é um MVP funcional com quase todos os pilares que Mudae e DreamTeam têm: coleção, raridade, economia e um loop social (desafiar outro jogador). O potencial de crescer é real, porque a base mecânica já existe e o nicho (cartas de anime, comunidade PT-BR) tem demanda comprovada — é literalmente o que Mudae, Karuta, WaifuGame e DreamTeam (esse último brasileiro, só que de futebol) já monetizam hoje.

O que falta não é reinventar o projeto, é: (1) corrigir alguns bugs de arquitetura que vão explodir assim que houver uso concorrente real, (2) dar profundidade estratégica às batalhas para virar algo que as pessoas joguem repetidamente, e (3) construir a camada de escala e monetização em cima da fundação que já existe.

## Problemas técnicos que precisam ser corrigidos antes de crescer

O mais grave é o padrão `let currentCollector = null` declarado no escopo do módulo em `rollRun.js`, `favcardRun.js` e `inventoryRun.js`. Como esse módulo é carregado uma única vez pelo Node e reusado por todas as interações, essa variável é compartilhada entre **todos os usuários do bot ao mesmo tempo**. Isso significa que se dois jogadores derem `/roll` próximo um do outro, o segundo `/roll` chama `currentCollector.stop()` e cancela o coletor de botões do primeiro jogador, quebrando silenciosamente a experiência dele. Hoje, com poucos usuários, isso quase nunca aparece; assim que o bot crescer, vai gerar reclamações constantes de "o botão parou de funcionar". A correção é trivial (guardar o coletor por `interaction.id` ou `user.id` num `Map`, não numa variável solta), mas é a prioridade número um.

O estado de batalha (`battleState.js`) vive inteiramente em memória num `Map` do processo Node. Funciona bem para um único processo, mas não sobrevive a um restart do bot nem funciona se você um dia rodar mais de uma instância/shard — batalhas em andamento simplesmente somem. Para múltiplos servidores grandes, Discord.js eventualmente vai exigir sharding, e esse estado precisa ir para Redis ou MongoDB com TTL antes disso.

Em `rollRun.js` a consulta ao usuário ainda usa o padrão de callback do Mongoose (`User.findOne({...}, (err, user) => {...})`) misturado com `async/await` no resto do arquivo — é um padrão antigo, mais difícil de tratar erros e inconsistente com o resto do código, que usa `await` corretamente.

A busca no mercado (`marketRun.js`) monta `RegExp` diretamente a partir do texto digitado pelo usuário (`cardname`, `series`, `rarity`) sem escapar caracteres especiais. Isso é ao mesmo tempo um risco de erro (usuário digita um caractere inválido de regex e a busca quebra) e, em teoria, de performance (regex maliciosa pode deixar a query lenta). Vale sanitizar antes de crescer a base de usuários.

Transferências de moeda (`/give`) e operações de mercado fazem duas gravações separadas (`sender.save()` depois `recipient.save()`, ou comprador/vendedor) sem transação do MongoDB. Com poucos usuários simultâneos isso nunca vai aparecer; com volume real, dá para duplicar ou perder moedas em corrida de concorrência. Vale usar sessions/transactions do Mongoose nessas operações.

O sorteio de carta em `/roll` faz `Card.find({rarity}).exec()` e carrega **toda** a raridade sorteada na memória antes de escolher uma aleatória. Com um catálogo pequeno isso é irrelevante; com milhares de cartas por raridade (o que você vai precisar para um jogo "grande"), isso fica caro em cada roll. Trocar por uma agregação com `$sample` resolve e escala melhor.

Existe também bastante código morto para limpar: a pasta `OldCommands/showall.js` inteira comentada, `TestFiles/message-count-schema.js` não referenciado em lugar nenhum, uma pasta vazia chamada `a` na raiz, handlers de mensagem comentados no `index.js`, e um servidor Express rodando na porta 3000 com um endpoint `/inserir` que aceita qualquer corpo sem autenticação e não faz nada de útil hoje — ou remove, ou transforma na base de uma API real (ver seção de escala). Também vale conferir a dependência `transform-props` no `package.json`, que não aparece usada em nenhum arquivo lido e pode ser lixo de uma instalação antiga.

Por fim, o cooldown de roll está hardcoded em 10 segundos com um comentário "temporário para testes, produção usa 15 min" — é fácil esquecer isso ligado em produção. Melhor mover para variável de ambiente.

## Dando profundidade ao combate

Hoje a batalha é 100% determinística: quem tem ATA maior ataca primeiro, dano é `POW` fixo, e no fundo quem tiver a soma de atributos maior quase sempre vence. Não há aleatoriedade tática, tipos, habilidades ou sinergias — é matemática pura de três números. Isso é ótimo como fundação, mas sozinho não sustenta um jogo que as pessoas joguem centenas de vezes, porque rapidamente fica óbvio "eu perco porque minhas cartas são piores", sem espaço para estratégia.

Para chegar ao nível de retenção de Mudae ou DreamTeam, o combate precisa de pelo menos uma camada extra de decisão: pode ser vantagem de tipo entre séries/animes (tipo pedra-papel-tesoura), habilidades passivas por carta (cura, dano em área, buff de aliado), variância controlada (chance de crítico, esquiva), ou bônus de sinergia quando as 3 cartas do deck são do mesmo anime. Qualquer uma dessas adiciona escolha real na hora de montar o deck, que é o que faz jogador voltar.

## O que faz Mudae e DreamTeam grandes — e o que aplicar aqui

Mudae cresce porque o roll é só a entrada; o motor de retenção é a competição social dentro do servidor: personagens têm quantidade limitada de claims, jogadores disputam quem "casa" com quem primeiro, existe wishlist com notificação quando o personagem desejado aparece, e kakera (moeda) vem de trocar/vender duplicatas, criando um mercado interno vivo. Nada disso depende de sorte pura — depende de estar online na hora certa e de estratégia social.

DreamTeam (o bot brasileiro de futebol, que é o comparável mais direto porque também é PT-BR e também monetiza dentro do Discord) foca em cartas de jogadores reais, monta "time dos sonhos" com sinergia entre jogadores/clubes, e monetiza vendendo pacotes de cartas com dinheiro real via PIX — um modelo de monetização testado especificamente para audiência brasileira, que é exatamente o público do seu bot.

Para o AniBattle, isso sugere: adicionar wishlist de personagens com notificação, dar às cartas mais raras algum tipo de escassez real (edição limitada, evento sazonal), permitir troca direta carta-por-carta entre jogadores (hoje só existe venda via mercado, não troca), e — o ponto mais importante para monetização — pensar em pacotes pagos via PIX/Stripe desde já, mesmo que a implementação venha depois.

## Escala (para "múltiplos jogadores online")

Com o volume atual de código, o bot ainda está numa escala de "um servidor, algumas dezenas de usuários". Para crescer de verdade, os pontos que vão importar são: mover cooldowns e cache para Redis em vez de bater no Mongo a cada `/roll`; normalizar o inventário do usuário para guardar só a referência da carta (`cardId`) em vez de duplicar todos os campos (nome, imagens, atributos) em cada cópia possuída — hoje, se você corrigir um atributo de uma carta no catálogo, todas as cópias já obtidas continuam com o valor antigo para sempre, e o banco cresce muito mais rápido do que precisa; cachear a imagem de carta gerada em canvas (é uma operação de CPU relativamente pesada, gerada hoje toda vez que alguém dá roll ou show da mesma carta, quando poderia ser gerada uma vez e reaproveitada); e, quando o bot passar de ~2500 servidores, configurar sharding do discord.js (`ShardingManager`), que o Discord passa a exigir nesse ponto.

Vale também decidir de propósito se a economia e o inventário são globais (um usuário tem o mesmo saldo/cartas em qualquer servidor, como está hoje) ou por servidor (como Mudae, que isola claims por servidor) — isso muda bastante o design social do jogo e é mais fácil decidir agora do que migrar depois.

## Monetização

Dado que o objetivo declarado do projeto é monetizar, o caminho mais direto e comprovado no mercado brasileiro (replicando o que o DreamTeam já faz) é vender moeda premium ou pacotes de cartas via checkout externo (Stripe ou PIX) que credita o usuário no Discord via webhook — o Discord também tem uma API própria de monetização de apps (Premium App Subscriptions) que vale pesquisar como alternativa nativa. O ponto de atenção é manter o que é vendido como cosmético ou de conveniência (slots de inventário, redução de cooldown, skins de carta, badges de perfil) em vez de vantagem direta de combate, para não afastar a base gratuita com percepção de "pay to win" — que é justamente o que mata bots desse tipo a médio prazo.

## Prioridade sugerida

1. ~~Corrigir o bug do `currentCollector` compartilhado~~ — feito em 02/08/2026.
2. ~~Limpar código morto e sanitizar entradas de regex no mercado~~ — feito em 02/08/2026.
3. Adicionar uma camada de decisão real ao combate (tipos, habilidades ou sinergia de série).
4. Migrar estado de batalha e cooldowns para fora da memória do processo (Redis/Mongo com TTL).
5. Normalizar o inventário e cachear imagens de carta.
6. Construir wishlist, trocas diretas entre jogadores e eventos/cartas limitadas.
7. Desenhar e implementar a camada de monetização (pacotes pagos, cosméticos).
8. Preparar sharding e observabilidade (logs estruturados, Sentry) para quando o número de servidores crescer.
