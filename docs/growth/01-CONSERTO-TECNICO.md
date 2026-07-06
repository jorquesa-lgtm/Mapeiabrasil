# Conserto técnico do funil — checklist executável (30–60 min)

O funil está 401 desde 16/06 (commit `3647072`: URLs novas + chaves antigas). Nada de ads,
outreach com link, ou conclusão sobre "demanda" antes de fechar este checklist.

## Passo 1 — Pegar as chaves corretas (5 min) — FOUNDER

No dashboard do Supabase do projeto **`vaekdvwevooqrlubctoj`** → Settings → API:
- copie a **anon/public key** (JWT `eyJ...`)
- copie a **publishable key** (`sb_publishable_...`) se o projeto usar o formato novo

## Passo 2 — Substituir as chaves velhas (10 min) — FOUNDER (ou IA, colando você a chave)

A chave velha (JWT com `ref: isfnlejwanzizsrxhpii`) está hardcoded em 4 arquivos:

| Arquivo | Linha aprox. | O que trocar |
|---|---|---|
| `public/diagnostico.html` | 838 | `SUPABASE_ANON_KEY` |
| `public/obrigado.html` | 148 | `SUPABASE_ANON_KEY` |
| `public/admin.html` | 277 | `SUPABASE_ANON_KEY` |
| `public/dev-test.html` | 195 | `SUPABASE_ANON_KEY` |

E a `sb_publishable_80fO4pk5-...` (pré-repoint, provavelmente do projeto antigo) em:

| Arquivo | Uso |
|---|---|
| `public/kits/index.html` (~l.449) | header `apikey` do `create-kit-checkout` |
| `public/kits/kit-*.html` (5 arquivos, 2 ocorrências cada) | idem + `activate-kit-code` |

Busca e troca: `grep -rn "sb_publishable_80fO4pk5" public/` e `grep -rln "isfnlejwanzizsrxhpii"` —
se o grep da ref antiga não achar nada é porque a chave está em base64 no meio do JWT; troque
pelos file:line da tabela.

## Passo 3 — Conferir env vars do build (5 min) — FOUNDER

A homepage e o painel usam `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` resolvidas **no
build do host** (não há `.env` no repo). No painel do host onde o site é publicado (DNS aponta
para infra Vercel — provavelmente a conta do Bolt, não a sua conta Vercel `jorquesa-lgtm`, que
só tem o projeto viaretravel):
- `VITE_SUPABASE_URL` = `https://vaekdvwevooqrlubctoj.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = anon key do MESMO projeto
- Redeploy.

## Passo 4 — Conferir migrações no projeto de produção (10 min) — FOUNDER

O projeto `vaekdvwevooqrlubctoj` precisa ter a tabela `leads` com a policy pública de INSERT
(migração `supabase/migrations/20260420162023_create_leads_table.sql`) e as edge functions
`capture-lead`, `create-checkout`, `create-kit-checkout`, `validate-access-code` publicadas.
Dashboard → Table Editor (existe `leads`?) e → Edge Functions (estão lá?). Se não:
`supabase link --project-ref vaekdvwevooqrlubctoj && supabase db push && supabase functions deploy`.

## Passo 5 — Teste E2E de verdade (10 min) — FOUNDER

1. Janela anônima → mapeiabrasil.com → `/diagnostico.html` → preencher nome+e-mail reais seus →
   a linha aparece na tabela `leads`? O e-mail de boas-vindas (Resend) chegou?
2. Paywall R$99 → clicar "Desbloquear" → abre checkout Stripe? (pode cancelar na tela do Stripe)
3. `/kits/` → "Adquirir por R$149" do Kit 3 → o checkout abre **com R$149, não R$499**?
   (bug corrigido neste branch — validar pós-deploy)
4. Simular pagamento em modo test do Stripe → cai em `/obrigado-premium.html` (não 404)?

## Passo 6 — Alarme de cano roto (15 min) — FOUNDER, com IA

Para nunca mais passar 14 dias cego: agendar (cron do Supabase ou Make) um ping diário que
insere+deleta um lead `CANARY_` e avisa no seu WhatsApp/e-mail se falhar. Posso gerar o SQL/
cenário Make quando o acesso ao projeto de produção existir nesta sessão.

## Já corrigido neste branch (IA-EXECUTADO)

- ✅ Passo 1–2: fundador confirmou e colou a `anon key` correta do projeto `vaekdvwevooqrlubctoj`
  (decodificada e verificada: `ref: vaekdvwevooqrlubctoj`, `role: anon`) — trocada em
  `diagnostico.html`, `obrigado.html`, `admin.html`, `dev-test.html`. Commit `d764849`.
- ✅ `sb_publishable_80fO4pk5-...` usada nos kits: fundador confirmou no dashboard do mesmo
  projeto que é o valor correto — nenhuma troca necessária, os kit pages já estavam certos.
- `public/kits/index.html`: cada botão "Adquirir por R$149" agora envia seu `kit1..kit5`
  (antes: todos enviavam `bundle` → checkout de R$499/mês).
- `index.html`: success_url → `/obrigado-premium.html` (antes: caminho sem extensão, 404).
- Hero da homepage reescrito (ver `02-REESCRITA-LANDING.md`).

**Restam apenas Passos 3–6, todos exigem acesso ao host de deploy / dashboard Supabase que
esta sessão não tem — ver abaixo.**

## Leads possivelmente perdidos no projeto antigo

Se o projeto `isfnlejwanzizsrxhpii` ainda existir: olhe a tabela `leads` dele. Todo lead de
08–16/06 (antes do repoint) caiu LÁ. Se houver nomes: são seus primeiros alvos de outreach —
gente que JÁ levantou a mão.
