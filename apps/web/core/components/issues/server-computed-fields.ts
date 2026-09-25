import type { TIssue } from "@plane/types";
import { IssueService } from "@/services/issue";

const issueService = new IssueService();

/**
 * Pole, která dopočítává backend v Issue.save():
 *  - budget_complete ("Náklady celkem") = součet nákladových polí
 *  - cost_order_calling = 1200 při zaškrtnutí "Závazně objednáno"
 *  - cost_postproduction = hodiny z řádku "postprodukce" tabulky "Časová náročnost" v popisu × 669
 *
 * PATCH vrací 204 bez dat a store nerefetchuje, proto po uložení issue načteme a do store
 * propíšeme JEN tyhle hodnoty - ne celé issue, aby refresh nepřepsal jinou úpravu, která
 * mezitím proběhla. Chyba refreshe nevadí - data jsou uložená.
 */
export const refreshServerComputedIssueFields = async (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  updateIssue: (issueId: string, data: Partial<TIssue>) => void
) => {
  try {
    const fresh = await issueService.retrieve(workspaceSlug, projectId, issueId);
    if (!fresh) return;
    updateIssue(issueId, {
      budget_complete: fresh.budget_complete,
      cost_order_calling: fresh.cost_order_calling,
      cost_postproduction: fresh.cost_postproduction,
    });
  } catch (err) {
    console.error("Refresh of server-computed issue fields failed", err);
  }
};

/** Obsahuje popis tabulku, ze které backend počítá Postprodukci? (jinak refresh není potřeba) */
export const descriptionAffectsServerComputedFields = (descriptionHtml: string) =>
  descriptionHtml.toLowerCase().includes("postprodukce");
