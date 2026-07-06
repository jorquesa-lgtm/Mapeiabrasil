# Play 1 — Motor de inbound: Ads → site → bot do WhatsApp (Twilio)

O único WhatsApp 100% automatizado e 100% dentro das regras: o prospect clica no anúncio,
cai na home nova, clica "Quero cortar minhas faltas" e **manda a primeira mensagem** para o
seu número Twilio (+55 11 92203-1943 — o mesmo do site). Isso é opt-in de manual. O bot
qualifica 24/7; você só entra na conversa quente.

## Por que a campanha anterior falhou (não repetir)

R$0,23 de CPC com 4,71% de CTR e 54% dos cliques sem carregar a página = tráfego de
Audience Network / cliques acidentais. **[Certainty]** Barato por clique, caro por cliente.
As configurações abaixo existem para comprar gente de verdade, mais cara e em menor volume.

## Configuração exata — Meta Ads (Gerenciador de Anúncios)

| Config | Valor | Por quê |
|---|---|---|
| Objetivo | **Engajamento → Conversões no site**, evento **Contact** | O pixel agora dispara `Contact` a cada clique em wa.me (adicionado em index.html). Otimiza para quem inicia conversa, não para quem clica. |
| Advantage+ / posicionamentos automáticos | **DESLIGADO** — posicionamentos manuais | É onde nasce o tráfego lixo. |
| Posicionamentos | SOMENTE **Feed do Instagram + Feed do Facebook + Stories do Instagram**. Desmarcar Audience Network INTEIRO, Reels overlay, right column, Marketplace | Elimina clique acidental. |
| Público | Região: 1 cidade (a mesma da prospecção). Idade 25–55. Interesses: pequenos negócios, empreendedorismo, salão de beleza/estética/gestão de clínicas | Dono de negócio local, não público frio genérico. |
| Orçamento | **R$15–20/dia, teto R$250 no teste** (10–14 dias) | Cabe no teto de R$1.000–1.500/mês com folga para iterar. |
| Destino | https://mapeiabrasil.com/ (home nova, hero anti-falta) | CTA primário já é wa.me → bot. |
| Criativo 1 (imagem/carrossel) | Título: "Cliente que falta não avisa. Seu WhatsApp avisa." Corpo: "Lembrete automático 24h e 1h antes. O cliente confirma com um SIM — e a vaga não morre. Instalado para você em 7 dias. Salão, clínica, estética, pet." | Espelha o hero — coerência anúncio→página. |
| Criativo 2 (vídeo 15s, celular na mão) | Print/screencast da mensagem de confirmação chegando + cliente respondendo SIM. Legenda: "Cada falta leva R$80–300. Corte até 60% delas." | Mostrar > explicar. |
| UTM | `?utm_source=meta&utm_medium=cpc&utm_campaign=antifalta_v1` | Rastreio no dashboard. |

**Google Ads:** pausar por enquanto. R$33 gastos e 11 cliques no último ciclo — sem massa
crítica. Um canal bem operado > dois mal operados. [Probable]

## Antes de ligar (checklist, nesta ordem)

1. ☐ Republicar o site via Bolt (o evento Contact está no código novo — sem republicar, a
   otimização por Contact não recebe sinal).
2. ☐ No Gerenciador de Eventos da Meta (pixel 1521448069779860): confirmar que o evento
   **Contact** aparece após você mesmo clicar no botão do WhatsApp da home publicada.
3. ☐ Testar o bot: mandar "Olá" do seu celular para +55 11 92203-1943 e conferir se a
   resposta automática está decente para um dono de salão (não um lead de software).
4. ☐ Só então ativar a campanha.

## Metas do teste de R$250 (10–14 dias) e critérios de decisão

| Métrica | Faixa esperada [Assumption — benchmark] | Ação se abaixo |
|---|---|---|
| CPC | R$0,80–2,50 | CPC < R$0,40 = tráfego lixo de novo → conferir posicionamentos |
| Cliques → landing views | > 85% | Se < 70%, problema de página/velocidade |
| Visitante → clique WhatsApp (Contact) | 2–5% | < 1% após 150 visitas → trocar criativo; < 1% após 300 → hero não convence, me traga os dados |
| Conversas iniciadas no bot | 5–20 no teste | 0 conversas com 10+ Contacts = bot/número quebrado — testar item 3 do checklist |
| Custo por conversa iniciada | R$12–50 | > R$80 → pausar e revisar antes de gastar mais |

**Kill do canal:** R$250 gastos, ≥10 conversas iniciadas e **0** avançam para orçamento/piloto →
o problema é oferta/bot, não mídia. Pausar ads e me trazer as transcrições do bot.

## O que o bot precisa fazer (e o que ele NÃO decide)

O bot qualifica: ramo, cidade, quantos horários/dia, % de falta estimada, e **pede o melhor
horário para o Jorge chamar**. O fechamento do piloto de R$497 é humano — [Certainty] nenhum
dono de salão paga R$497 para um robô que acabou de conhecer. O bot marca a conversa;
você fecha.
