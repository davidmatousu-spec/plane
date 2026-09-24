// Skenovač - pevný seznam lidí. Ukládají se křestní jména, víc lidí oddělených čárkou
// ("Adam, Jirka") - stejný formát jako dealer (Obchodník).

export const SCANNER_OPTIONS = [
  { value: "Adam", label: "Adam" },
  { value: "David", label: "David" },
  { value: "Jirka", label: "Jirka" },
] as const;

const SCANNER_VALUES: string[] = SCANNER_OPTIONS.map((o) => o.value);

// Barva štítku na kartě / v sub-issues - tyrkysová: nekoliduje s obchodníkem (indigo/zelená)
// ani s podbarvením karty podle priority (červená/oranžová/žlutá/modrá). Inset obrys
// místo borderu, aby štítek neměl jinou výšku než štítek obchodníka.
// Inline style, protože Tailwind paleta je v tomhle forku osekaná.
export const SCANNER_BADGE_STYLE = {
  backgroundColor: "rgba(34, 211, 238, 0.14)",
  color: "rgb(34, 211, 238)",
  boxShadow: "inset 0 0 0 1px rgba(34, 211, 238, 0.35)",
} as const;

/** "adam" -> "Adam"; neznámé jméno (např. zapsané přes API) necháme beze změny. */
function normalizeScanner(raw: string): string {
  const trimmed = raw.trim();
  return SCANNER_VALUES.find((v) => v.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

/** "Adam, Jirka" -> ["Adam", "Jirka"]; "" / null -> [] */
export function parseScanners(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split(",")
    .map(normalizeScanner)
    .filter((s) => s !== "");
}

/** ["Adam", "Jirka"] -> "Adam, Jirka" */
export function joinScanners(scanners: string[]): string {
  return scanners.filter((s) => s !== "").join(", ");
}
