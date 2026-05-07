# N8n – Průvodce paralelním provozem (Sheets + Supabase)

## Postup: přidání Postgres nodů VEDLE stávajících Sheets nodů

> ⚠️ **Stávající Sheets nody NEMAŽTE!** Přidáváme nové Postgres nody paralelně.
> Workflow bude zapisovat do obou systémů současně.

---

## Krok 1: Přidat Postgres credentials do n8n

1. V n8n → **Settings** → **Credentials** → **Add Credential**
2. Typ: **Postgres**
3. Vyplnit:
   - **Host:** `db.XXXXX.supabase.co` (nebo váš self-hosted hostname)
   - **Database:** `postgres`
   - **User:** `postgres`
   - **Password:** (DB password)
   - **Port:** `5432` (nebo `6543` pro connection pooler)
   - **SSL:** ✅ Require (pro cloud Supabase), nebo dle vaší konfigurace

---

## Krok 2: Přidat UPSERT node (vedle Sheets zápisů)

### Kde v workflow:
Napojit za node **"Extrakce z description"** jako **paralelní větev** (ne místo stávajících Sheets nodů).

### Node konfigurace:

- **Type:** Postgres
- **Operation:** Execute Query
- **Query:**

```sql
INSERT INTO plane_issues (
  id_ukolu, nazev, popis, url, latitude, longitude,
  stav, due_date, description_short,
  plane_project_id, priority, labels, assignees, contact_person,
  last_webhook_action
)
VALUES (
  $1, $2, $3, $4, $5::double precision, $6::double precision,
  $7, $8::date, $9,
  $10, $11, $12::jsonb, $13::jsonb, $14,
  $15
)
ON CONFLICT (id_ukolu) DO UPDATE SET
  nazev = EXCLUDED.nazev,
  popis = EXCLUDED.popis,
  url = EXCLUDED.url,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  stav = EXCLUDED.stav,
  due_date = EXCLUDED.due_date,
  description_short = EXCLUDED.description_short,
  plane_project_id = EXCLUDED.plane_project_id,
  priority = EXCLUDED.priority,
  labels = EXCLUDED.labels,
  assignees = EXCLUDED.assignees,
  contact_person = EXCLUDED.contact_person,
  last_webhook_action = EXCLUDED.last_webhook_action;
```

### Parametry (Query Parameters):

| # | Parametr | N8n Expression |
|---|---|---|
| $1 | id_ukolu | `{{ $('Code in JavaScript').item.json.body.data.id }}` |
| $2 | nazev | `{{ $('Code in JavaScript').item.json.body.data.name }}` |
| $3 | popis | `{{ $('Extrakce z description').item.json.description_formatted }}` |
| $4 | url | `https://www.google.com/maps?q={{ $('Extrakce z description').item.json.lat }},{{ $('Extrakce z description').item.json.lon }}` |
| $5 | latitude | `{{ $('Extrakce z description').item.json.lat }}` |
| $6 | longitude | `{{ $('Extrakce z description').item.json.lon }}` |
| $7 | stav | `{{ $('Code in JavaScript').item.json.body.data.state.name }}` |
| $8 | due_date | `{{ $('Code in JavaScript').item.json.body.data.target_date || null }}` |
| $9 | description_short | `{{ $('Extrakce z description').item.json.description_short || '' }}` |
| $10 | plane_project_id | `{{ $('Code in JavaScript').item.json.body.data.project }}` |
| $11 | priority | `{{ $('Code in JavaScript').item.json.body.data.priority || 'none' }}` |
| $12 | labels | `{{ JSON.stringify($('Code in JavaScript').item.json.body.data.labels || []) }}` |
| $13 | assignees | `{{ JSON.stringify($('Code in JavaScript').item.json.body.data.assignees || []) }}` |
| $14 | contact_person | `{{ $('Extrakce z description').item.json.contact_person || '' }}` |
| $15 | last_webhook_action | `{{ $('Code in JavaScript').item.json.body.action }}` |

> **Tip:** V n8n Postgres node použijte "Query Parameters" (ne string interpolaci) – to zabrání SQL injection a správně typuje NULL hodnoty.

---

## Krok 3: (Volitelné) Přidat anti-spam Postgres node

Pokud chcete testovat i nový anti-spam mechanismus, přidejte **druhý Postgres node** za stávající anti-spam logiku:

```sql
-- Atomický anti-spam: aktualizuj last_slack_sent POUZE pokud uplynuly 3+ minuty
UPDATE plane_issues
SET last_slack_sent = now()
WHERE id_ukolu = $1
  AND (last_slack_sent IS NULL OR last_slack_sent < now() - interval '3 minutes')
RETURNING id_ukolu;
```

Parametr `$1`: `{{ $('Code in JavaScript').item.json.body.data.id }}`

- Pokud dotaz vrátí řádek → anti-spam povoluje Slack
- Pokud nevrátí nic → anti-spam blokuje (duplicitní notifikace)

> **Zatím toto nespojujte se Slack nodem!** Slouží jen pro testování a srovnání s existujícím Sheets mechanismem. Slack notifikace ať nadále řídí stávající workflow.

---

## Schéma paralelního provozu

```
                          ┌─── Sheets nody (stávající) ──→ Google Sheets ✅
Extrakce z description ───┤
                          └─── Postgres UPSERT (nový) ──→ Supabase ✅ (NEW)


                          ┌─── Sheets timestamp logika ──→ Slack ✅ (stávající)
Anti-Spam Paměť ──────────┤
                          └─── Postgres UPDATE (nový) ──→ jen log (NEW)
```

**Obě větve běží nezávisle.** Pokud Postgres node selže, Sheets větev funguje dál (a naopak).

---

## Ověření

Po přidání nodů:
1. Vytvořte test issue v Plane
2. Zkontrolujte v Supabase: `SELECT * FROM plane_issues ORDER BY created_at DESC LIMIT 5;`
3. Upravte issue v Plane → ověřte, že se v Supabase aktualizoval (ne zduplikoval)
4. Porovnejte data: Sheets vs. Supabase – měly by být identické
