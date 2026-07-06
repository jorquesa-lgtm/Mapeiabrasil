# MapeiaBrasil — Diagnóstico de Zero Clientes (06/07/2026)

Dados-fonte: dashboard de ads do fundador (06/08–06/30), repositório `jorquesa-lgtm/Mapeiabrasil`,
auditoria de código em 6 agentes (workflow `mapeia-zero-clients-audit`), entrevista com o fundador.

## Os números (base de tudo)

| Métrica | Valor | Fonte |
|---|---|---|
| Gasto em ads (23 dias) | R$ 667,65 (Meta 95%) | dashboard |
| Cliques | 2.900 (CPC R$0,23 · CTR 4,71%) | dashboard |
| Landing views | 1.326 (54% dos cliques se perdem) | dashboard |
| Leads no Supabase | **0** | dashboard |
| Conversões de plataforma | **0** | dashboard |
| Receita | **R$ 0** | dashboard |
| Prospecção ativa (DM/e-mail/ligação) em 90 dias | **0 enviadas, 0 conversas** | entrevista |
| Runway declarado | ~2 meses (mata ≈ 06/09/2026) | entrevista |

## FASE 1 — Classificação da falha

**Dominante: (b) tráfego sem conversão — em versão composta.** [Certainty no nível do código; ~85–90% para produção]

Três camadas, todas confirmadas:

1. **O funil estava tecnicamente MORTO durante a campanha.** O commit `3647072` (16/06 — dia 9 da
   campanha de 23 dias) trocou as URLs do Supabase para o projeto `vaekdvwevooqrlubctoj`, mas
   **manteve a anon key antiga** — o JWT hardcoded em `public/diagnostico.html:838`,
   `obrigado.html:148`, `admin.html:277` decodifica para `ref: isfnlejwanzizsrxhpii` (projeto
   antigo). Chave assinada por outro projeto ⇒ **401 em toda chamada**: captura de lead
   (`capture-lead` nas 3 entradas do diagnóstico), gravação de respostas, e **o próprio checkout
   de R$99** ("Não foi possível iniciar o pagamento"). Pior: os pixels de conversão (gtag + fbq
   "Lead") só disparam dentro do `.then` do fetch que falha — **a própria medição foi destruída
   junto**. "0 leads" NÃO é evidência de desinteresse; é evidência de cano rompido.
2. **O tráfego era lixo.** [Probable] CPC de R$0,23 com CTR 4,71% e 54% de perda clique→view é
   assinatura clássica de Audience Network / cliques acidentais. Mesmo com funil são, converteria
   perto de zero.
3. **Zero prospecção humana.** [Certainty] Nenhum prospect jamais ouviu a oferta. Não existe
   rejeição registrada porque não existe conversa registrada.

Consequência brutal: **após 3 meses e R$668, o negócio possui ZERO dado válido de demanda.**
Não dá para afirmar (d) oferta rejeitada nem (e) mercado errado — o instrumento de medição
estava quebrado e ninguém foi perguntado.

Bugs secundários confirmados (corrigidos neste branch):
- `public/kits/index.html`: os 5 botões "Adquirir por R$149" enviavam `{kit:'bundle'}` — todo
  comprador de kit individual caía no checkout do pacote de **R$499/mês**. [Certainty]
- `index.html:2840`: success_url pós-pagamento apontava para `/obrigado-premium` sem `.html`
  (404 provável em host estático). [Probable]

## FASE 2 — Causa raiz (5 porquês)

1. Por que zero clientes? → Nunca existiu uma oportunidade válida de compra: funil 401 + tráfego lixo + zero outreach.
2. Por que o funil ficou morto 14+ dias sem ninguém notar? → Ninguém testou o formulário/checkout de ponta a ponta após o repoint de 16/06; o dashboard mede gasto, não integridade de captura.
3. Por que não houve teste E2E? → As horas do fundador foram para construir MAIS superfície (3 idiomas, 5 kits, blog, painel, admin, copilot) em vez de operar UM funil.
4. Por que construir em vez de operar? → Construir parece progresso e evita contato com cliente — o fundador precifica a própria hora em >R$500 para trabalho voltado a cliente.
5. Por que evitar contato com cliente? → **Causa raiz: o negócio foi desenhado como máquina de venda sem humanos (ads → quiz de 35 perguntas → Stripe) para caber na restrição do fundador. Funil sem toque humano só funciona DEPOIS que a oferta foi validada em conversas humanas. Infraestrutura foi usada como substituto de validação.**

**Hipótese falsificável (uma só):** *"Existe pelo menos um vertical de serviço com hora marcada
(salão/clínica/estética/pet) em que 20 conversas humanas produzem ≥3 compromissos pagos de
R$497 por um piloto anti-falta instalado-para-você."*

**Teste de 7 dias (mais barato possível) — teto de orçamento: R$100:**
- Dia 0: consertar as chaves (checklist `01-CONSERTO-TECNICO.md`) — 30 min do fundador.
- Dias 1–5: 20 mensagens de WhatsApp/dia (100 total) para donos de negócio de agenda em UMA
  cidade, lista montada via Google Maps (método em `03-PROSPECCAO.md`). Custo: R$0.
- **Confirma a hipótese:** ≥10 respostas E ≥3 conversas reais E ≥1 piloto pago.
- **Mata a hipótese:** <5 respostas em 100 envios, OU ≥15 conversas com 0 pilotos pagos.
- Ads: **R$0 nesta semana.** Nenhum real em mídia antes de o cano estar consertado e testado.

## FASE 3 — Kill / Pivot / Persevere (limiares de 30 dias — até 05/08/2026)

| Decisão | Condição numérica |
|---|---|
| **PERSEVERE** | ≥400 mensagens enviadas E ≥15 conversas E **≥3 pilotos pagos (≥R$1.400 de caixa)** E funil retestado captando ≥2% visitante→lead |
| **PIVOT** (oferta/preço/vertical) | ≥15 conversas com 1–2 pagamentos, OU respostas ≥10% mas objeção de preço/formato dominante em ≥50% — pivotar com os verbatims, não com opinião |
| **KILL** | (i) fundador enviou <200 mensagens em 30 dias — *kill comportamental: o negócio exige um vendedor e não tem um*; OU (ii) ≥20 conversas e **0** pagamento; OU (iii) caixa < R$1.000 restante |

**Confronto direto [Certainty]:** sua regra ">R$500/hora para atender cliente" com R$0 de
receita e 2 meses de caixa é a causa raiz operando em tempo real. As 20 conversas do teste valem
a existência da empresa — não há uso alternativo das suas 10–15h semanais com ROI maior. Se você
decidir que não fará 1h/dia de WhatsApp por 30 dias, a recomendação honesta é **KILL hoje**, e
economizar os R$2.000–3.000 de runway.

## FASE 4 — Plano de 30 dias (06/07 → 05/08)

Restrição dura respeitada: ≥60% das horas do fundador em contato direto com cliente
(6–9h/sem de 10–15h). **Zero horas em feature nova. Zero real em ads na semana 1.**

| # | Ação | Dono | Métrica | Meta | Prazo |
|---|---|---|---|---|---|
| 1 | Consertar chaves Supabase + redeploy + teste E2E real (form→lead→e-mail; checkout→Stripe test) | Fundador (30–60 min, checklist pronto) | funil vivo | 1 lead de teste visível no admin | 08/07 |
| 2 | Merge deste branch (fixes + landing nova) | Fundador | deploy | live | 08/07 |
| 3 | Montar lista de 300 prospects (Google Maps, 1 cidade, 3 verticais de agenda) | Fundador c/ script pronto (`03-PROSPECCAO.md`) | prospects na planilha | 300 | 10/07 |
| 4 | Outreach WhatsApp: 20/dia útil | **Fundador** | msgs enviadas | 100/sem, 400/mês | diário |
| 5 | Conversas → usar script de objeções, gravar verbatims na planilha | **Fundador** | conversas | ≥15 no mês | contínuo |
| 6 | Vender Piloto Anti-Falta R$497 setup + R$149/mês (`04-OFERTA-PRECO.md`) | Fundador | pilotos pagos | ≥3 | 05/08 |
| 7 | Instalar pilotos vendidos (blueprint kit3 já existe) | Fundador (2–3h/piloto; R$497 ⇒ R$165–250/h, sobe p/ R$997 no 6º cliente) | pilotos no ar | 100% dos vendidos em ≤7 dias | contínuo |
| 8 | Reteste de tráfego SÓ após 1 piloto instalado: R$250, Meta manual, só feed IG/FB, sem Audience Network, destino = landing nova | Fundador aciona; IA analisa | visitante→WhatsApp | ≥2% | semana 3–4 |
| 9 | Scorecard semanal preenchido (`06-SCORECARD.md`) | Fundador (10 min/sem) + IA analisa | semanas preenchidas | 4/4 | toda sexta |
| 10 | Decisão Kill/Pivot/Persevere com os números da Fase 3 | Fundador + IA | decisão registrada | tomada | 05/08 |

**Impacto esperado (faixas e lógica):**
- Conserto do funil: pré-condição de TODA receita; sem ele, tudo = R$0. [Certainty]
- Outreach 400 msgs → 8–15% resposta (WhatsApp frio local) → 15–30 conversas → 2–5 pilotos →
  **R$1.000–2.500 de caixa no mês 1** + o ativo mais valioso: objeções verbatim. [Assumption —
  faixas de benchmark de prospecção fria local; nenhum dado próprio existe ainda]
- Landing nova: 0% → 2–5% visitante→WhatsApp em tráfego limpo (benchmark de LP direta com CTA
  de baixa fricção). [Assumption]
- Reprecificação: alinha ao teto competitivo real (SaaS verticais R$115–200/mês com lembrete
  incluso — ver `04-OFERTA-PRECO.md`); setup fee antecipa caixa dentro do runway. [Probable]

## O que ainda está faltando (degrada o diagnóstico)

- [Assumption] Não consegui ler o projeto Supabase de produção (`vaekdvwevooqrlubctoj` — outra
  conta) nem o site publicado (proxy de rede bloqueou). A confirmação final de que o deploy
  espelha o repo é sua: 1 submissão de teste após o conserto resolve.
- [Assumption] Preços de concorrentes são de conhecimento ~jan/2026, não verificados ao vivo
  (bloqueio de rede) — confirmar antes de decisão final de preço.
- Host real do site (DNS aponta para infra Vercel, mas em conta que esta sessão não vê;
  provável deploy via Bolt). Env vars `VITE_SUPABASE_URL/ANON_KEY` do build precisam ser
  conferidas lá — item 2 do checklist.
