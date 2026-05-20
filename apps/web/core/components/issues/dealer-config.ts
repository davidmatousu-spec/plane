// Dealer (Obchodník) configuration - hardcoded list + auto-normalization
// v2: multi-dealer support (parseDealers / joinDealers)

export const DEALER_OPTIONS = [
  { value: "Adam Bosák", label: "Adam Bosák" },
  { value: "Josef Sankot", label: "Josef Sankot" },
  { value: "Jan Pertl", label: "Jan Pertl" },
  { value: "Samuel Mišík", label: "Samuel Mišík" },
] as const;

// All known dealer values (for quick lookup)
export const DEALER_VALUES = DEALER_OPTIONS.map((o) => o.value);

// Mapping of partial/nickname matches to full names
// Keys are lowercase, values are the canonical full name
const DEALER_ALIASES: Record<string, string> = {
  // Adam Bosák
  "adam": "Adam Bosák",
  "bosák": "Adam Bosák",
  "bosak": "Adam Bosák",
  "adam bosák": "Adam Bosák",
  "adam bosak": "Adam Bosák",
  "adambosák": "Adam Bosák",
  "adambosak": "Adam Bosák",
  "a. bosák": "Adam Bosák",
  "a. bosak": "Adam Bosák",
  "a.bosák": "Adam Bosák",
  "a.bosak": "Adam Bosák",

  // Josef Sankot
  "josef": "Josef Sankot",
  "sankot": "Josef Sankot",
  "šankot": "Josef Sankot",
  "josef sankot": "Josef Sankot",
  "josef šankot": "Josef Sankot",
  "j. sankot": "Josef Sankot",
  "j.sankot": "Josef Sankot",
  "j. šankot": "Josef Sankot",
  "j.šankot": "Josef Sankot",

  // Jan Pertl
  "jan": "Jan Pertl",
  "pertl": "Jan Pertl",
  "jan pertl": "Jan Pertl",
  "j. pertl": "Jan Pertl",
  "j.pertl": "Jan Pertl",
  "honza": "Jan Pertl",

  // Samuel Mišík
  "samuel": "Samuel Mišík",
  "mišík": "Samuel Mišík",
  "misik": "Samuel Mišík",
  "misík": "Samuel Mišík",
  "mišik": "Samuel Mišík",
  "samuel mišík": "Samuel Mišík",
  "samuel misik": "Samuel Mišík",
  "samuel misík": "Samuel Mišík",
  "samuel mišik": "Samuel Mišík",
  "s. mišík": "Samuel Mišík",
  "s.mišík": "Samuel Mišík",
  "s. misik": "Samuel Mišík",
  "s.misik": "Samuel Mišík",
  "s. misík": "Samuel Mišík",
  "s.misík": "Samuel Mišík",
};

/**
 * Try to normalize a dealer string to a known full name.
 * - If empty → returns ""
 * - If exact match → returns the canonical name
 * - If partial/alias match → returns the canonical name
 * - If no match → returns the original string unchanged
 */
export function normalizeDealer(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") return "";

  const trimmed = raw.trim();

  // 1. Exact match (case-insensitive)
  const exactMatch = DEALER_VALUES.find(
    (v) => v.toLowerCase() === trimmed.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  // 2. Alias lookup
  const key = trimmed.toLowerCase();
  if (DEALER_ALIASES[key]) return DEALER_ALIASES[key];

  // 3. Fuzzy: check if any alias is contained in the input or vice versa
  for (const [alias, fullName] of Object.entries(DEALER_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) {
      return fullName;
    }
  }

  // 4. No match - return original
  return trimmed;
}

/**
 * Parse a comma-separated dealer string into an array of normalized names.
 * - "" or null → []
 * - "Adam Bosák" → ["Adam Bosák"]
 * - "Adam Bosák, Josef Sankot" → ["Adam Bosák", "Josef Sankot"]
 */
export function parseDealers(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => normalizeDealer(s.trim()))
    .filter((s) => s !== "");
}

/**
 * Join an array of dealer names back into a comma-separated string.
 * - [] → ""
 * - ["Adam Bosák"] → "Adam Bosák"
 * - ["Adam Bosák", "Josef Sankot"] → "Adam Bosák, Josef Sankot"
 */
export function joinDealers(dealers: string[]): string {
  return dealers.filter((s) => s !== "").join(", ");
}
