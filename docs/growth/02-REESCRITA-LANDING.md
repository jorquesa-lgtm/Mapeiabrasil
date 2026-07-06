# Reescrita da landing (PT-BR) — racional e copy completa

## O que o dado diz sobre a página antiga

- Headline antiga: *"Descubra em 10 minutos onde sua empresa perde tempo e dinheiro"* — o único
  número quantifica o **esforço do visitante**, não o resultado dele. [Certainty — copy no repo]
- CTA primário: um quiz de **35 perguntas / ~10 minutos** antes de qualquer valor entregue, para
  tráfego frio de Meta. Fricção máxima no primeiro contato.
- Público: "PMEs" — ninguém se reconhece. O fundador listou 4 verticais; a página não fala com
  nenhum deles.
- 1.326 views → 0 leads não prova rejeição (o funil estava 401), mas a estrutura acima
  converteria mal mesmo sã. [Probable]

## Decisões da reescrita (aplicadas no branch, no hero de `index.html`)

1. **Um público:** negócios que vivem de agenda (salão, clínica, estética, pet). É onde a dor é
   mensurável (falta = R$ perdido), o kit 3 já existe com promessa "-60% de no-show", e o
   comprador vive no WhatsApp.
2. **Uma promessa com número no H1:** custo da falta (R$80–300) + redução (até 60%).
3. **CTA de fricção mínima:** conversa no WhatsApp (não quiz, não cadastro). Efeito colateral
   estratégico: **força o fundador a conversar com prospects** — exatamente o que o diagnóstico
   receita. Diagnóstico vira CTA secundário.
4. Suporte de confiança: "Instalado para você · No ar em até 7 dias · sem fidelidade".

## Copy aplicada (hero)

- **Eyebrow:** Automação no WhatsApp para negócios que vivem de agenda
- **H1:** Cada cliente que falta leva **R$80 a R$300** com ele. Corte as faltas em até 60% — **sem trocar de sistema**.
- **Sub:** Lembrete automático no WhatsApp 24h e 1h antes do horário. Seu cliente confirma com um "SIM" — e a vaga não morre. Nós instalamos tudo para você em até 7 dias. Salões, clínicas, estética, pet: se a sua agenda paga as contas, isso é para você.
- **CTA 1:** Quero cortar minhas faltas → (wa.me/5511922031943 com texto pré-preenchido)
- **CTA 2:** Prefere se avaliar antes? Diagnóstico gratuito →
- **Microcopy:** Você fala direto com quem instala. Resposta no mesmo dia útil.

## Restante da página — mudanças recomendadas (aplicar após o hero validar)

Ordem nova das seções (a atual é diagnóstico-cêntrica):

1. **Hero** (feito).
2. **A conta da falta** (nova, 3 linhas): "20 horários/dia × 15% de falta × R$120 de ticket =
   R$7.200/mês evaporando. O lembrete que confirma reduz isso em até 60%." — calculadora simples
   opcional (input: horários/dia, ticket, % falta).
3. **Como funciona em 3 passos:** (1) Você me chama no WhatsApp e me diz como agenda hoje
   (papel, planilha, sistema). (2) Em até 7 dias o lembrete automático está no ar no SEU número.
   (3) Cliente confirma com SIM/NÃO; vaga liberada volta pra fila. — substitui o demo do quiz.
4. **Preço na cara:** Piloto Anti-Falta — R$497 de instalação + R$149/mês. "Uma falta evitada
   por mês já paga." Sem fidelidade. (ver `04-OFERTA-PRECO.md`)
5. **Prova:** enquanto não houver cliente, honestidade calibrada: "Vagas do piloto fundador:
   5 negócios, com acompanhamento direto do fundador e preço travado" — escassez verdadeira,
   não social proof inventada.
6. **FAQ enxuto:** "funciona com meu sistema?", "preciso trocar de número?", "e a LGPD?",
   "e se eu cancelar?".
7. Diagnóstico e demais kits: rebaixados para o rodapé/menu. Não competem mais pelo primeiro clique.

## Avisos

- Dicionários EN/ES (`translations.en/es` em `index.html`) mantêm a copy antiga — quem trocar de
  idioma vê o posicionamento velho. Decidir: atualizar ou remover o switcher (recomendo remover
  por ora; tráfego é 100% BR).
- O pixel Meta deve passar a otimizar por evento de clique no wa.me (Contact), não por Lead do
  quiz — senão o reteste de ads otimiza para a coisa errada.
- Kit pages seguem com copy de "entrega digital sem implementação" — conflita com o piloto
  instalado-para-você. Ajustar `kit-agendamento.html` para a oferta piloto ANTES do reteste de ads.
