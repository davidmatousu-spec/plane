# Migrace Slack notifikací: Google Sheets → Supabase

## Současný stav (co chceme nahradit)

Aktuálně Slack anti-spam používá **5 nodů + čekání 5s**:

```
Vygeneruj timestamp → Zapiš do Sheets → Počkej 5s → Přečti zpět → Jsi poslední? → IF → Pošli Slack
```

Problém: pomalé, závislé na Google Sheets, race conditions.

## Nový stav (1 Postgres node)

```
Anti-Spam Supabase → IF (vrátil řádek?) → Pošli Slack
```

---

## Krok 1: Přidat Postgres node "Anti-Spam Check"

### Kde v workflow:
Napojit **za** node "Překlad mailu u lidí co mají rozdílný mail Plane/Slack" (místo "Vygeneruj timestamp1").

### Node konfigurace:

- **Type:** Postgres
- **Credential:** Váš Supabase Postgres credential (stejný jako pro UPSERT)
- **Operation:** Execute Query
- **Query:**

```
{{ $json.antiSpamQuery }}
```

### Před tímto nodem přidejte Code node "Připrav Anti-Spam":

```javascript
const issueId = $('Code in JavaScript').first().json.body.data.id;

// Escapování
const esc = (v) => v == null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";

const query = `
UPDATE plane_issues
SET last_slack_sent = now()
WHERE id_ukolu = ${esc(issueId)}
  AND (last_slack_sent IS NULL OR last_slack_sent < now() - interval '3 minutes')
RETURNING id_ukolu;
`;

return { json: { ...($input.item.json), antiSpamQuery: query } };
```

---

## Krok 2: Přidat IF node "Poslat Slack?"

### Konfigurace:
- **Condition:** `{{ $json[0]?.id_ukolu }}` is not empty
- Nebo: `{{ $json.length }}` is greater than 0

**Logika:**
- Pokud `RETURNING` vrátil řádek → UPDATE proběhl → **povoleno poslat Slack** ✅
- Pokud nic nevrátil → uplynuly méně než 3 minuty → **blokováno** ❌

---

## Krok 3: Napojit Slack node

Za IF (true větev) napojte stávající "Poslání SLACK notifikace" node.

---

## Krok 4: Odpojit staré Sheets nody

**Po ověření** že Supabase anti-spam funguje správně:

1. Odpojte (nemazejte!) tyto nody:
   - "Vygeneruj timestamp1"
   - "Zapiš svůj timestamp1"
   - "Počkej 5 sekund1"
   - "Přečti zpět z Sheets1"
   - "Jsi poslední?1"
   - "Poslat Slack?1" (starý IF)

2. Tyto nody můžete nechat v workflow jako zálohu (disabled).

---

## Výsledné schéma

```
                                    ┌─── Code "Připrav Anti-Spam"
Překlad mailu u lidí ──────────────┤
                                    └─── Postgres "Anti-Spam Check"
                                              │
                                         IF (vrátil řádek?)
                                        /              \
                                    TRUE              FALSE
                                      │                (stop)
                              Poslání SLACK notifikace
```

## Výhody oproti stávajícímu řešení

| | Sheets (aktuální) | Supabase (nový) |
|---|---|---|
| **Počet nodů** | 5 + Wait | 2 (Code + Postgres) |
| **Čekání** | 5 sekund | 0 sekund |
| **Race conditions** | Možné | Nemožné (atomický SQL) |
| **Závislost na Sheets** | ✅ Ano | ❌ Ne |
| **Spolehlivost** | ⚠️ Rate limits | ✅ Databázová garance |

---

## Ověření

1. Upravte issue v Plane
2. Zkontrolujte v Supabase: `SELECT id_ukolu, last_slack_sent FROM plane_issues WHERE id_ukolu = '...'`
3. Ověřte že Slack zpráva přišla
4. Hned upravte znovu → Slack by NEMĚL přijít (3min cooldown)
5. Počkejte 3+ minuty → upravte → Slack by MĚL přijít
