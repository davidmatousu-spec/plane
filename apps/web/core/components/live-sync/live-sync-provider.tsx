import { useCallback, useEffect, useRef } from "react";
import { observer } from "mobx-react";
// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
// store
import { rootStore } from "@/lib/store-context";

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════
const LIVE_SYNC_CONFIG = {
  /** Polling interval in milliseconds */
  POLL_INTERVAL_MS: 10_000,
  /** Number of recent issues to check for changes */
  CHECK_COUNT: 50,
  /** Pause duration after own mutation (ms) */
  OWN_ACTION_PAUSE_MS: 5_000,
  /** Max consecutive errors before backing off */
  MAX_CONSECUTIVE_ERRORS: 5,
  /** Backoff duration after too many errors (ms) */
  ERROR_BACKOFF_MS: 60_000,
  /** Enable console logging for debugging */
  DEBUG: false,
};

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════
type PageContext = {
  type: "project";
  workspaceSlug: string;
  projectId: string;
  section: string;
  cycleId?: string;
  moduleId?: string;
  viewId?: string;
};

type PollResult = {
  fingerprint: string;
  issues: TIssue[];
} | null;

// ═══════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════
function log(...args: unknown[]) {
  if (LIVE_SYNC_CONFIG.DEBUG) {
    console.log("%c[LiveSync]", "color: #6366f1; font-weight: bold;", ...args);
  }
}

/**
 * Parse the current URL to determine which workspace/project/view the user is on.
 */
function getPageContext(): PageContext | null {
  const path = window.location.pathname;

  // /{workspace}/projects/{projectId}/cycles/{cycleId}/...
  const cycleMatch = path.match(
    /^\/([^/]+)\/projects\/([^/]+)\/cycles\/([^/]+)/
  );
  if (cycleMatch) {
    return {
      type: "project",
      workspaceSlug: cycleMatch[1],
      projectId: cycleMatch[2],
      section: "cycles",
      cycleId: cycleMatch[3],
    };
  }

  // /{workspace}/projects/{projectId}/modules/{moduleId}/...
  const moduleMatch = path.match(
    /^\/([^/]+)\/projects\/([^/]+)\/modules\/([^/]+)/
  );
  if (moduleMatch) {
    return {
      type: "project",
      workspaceSlug: moduleMatch[1],
      projectId: moduleMatch[2],
      section: "modules",
      moduleId: moduleMatch[3],
    };
  }

  // /{workspace}/projects/{projectId}/views/{viewId}/...
  const viewMatch = path.match(
    /^\/([^/]+)\/projects\/([^/]+)\/views\/([^/]+)/
  );
  if (viewMatch) {
    return {
      type: "project",
      workspaceSlug: viewMatch[1],
      projectId: viewMatch[2],
      section: "views",
      viewId: viewMatch[3],
    };
  }

  // /{workspace}/projects/{projectId}/issues/...
  const projectMatch = path.match(
    /^\/([^/]+)\/projects\/([^/]+)\/(issues|archived-issues)/
  );
  if (projectMatch) {
    return {
      type: "project",
      workspaceSlug: projectMatch[1],
      projectId: projectMatch[2],
      section: projectMatch[3],
    };
  }

  return null;
}

/**
 * Fetch recent issues from the API and compute a fingerprint.
 * Returns BOTH the fingerprint AND the raw issue data, so we can
 * silently merge the data into the MobX store without a second fetch.
 */
async function fetchIssuesAndFingerprint(ctx: PageContext): Promise<PollResult> {
  const url = `${API_BASE_URL}/api/workspaces/${ctx.workspaceSlug}/projects/${ctx.projectId}/issues/?order_by=-updated_at&per_page=${LIVE_SYNC_CONFIG.CHECK_COUNT}&cursor=0:0:0`;

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Extract issues from paginated/grouped responses
    let issues: TIssue[] = [];

    if (data.results && Array.isArray(data.results)) {
      issues = data.results;
    } else if (Array.isArray(data)) {
      issues = data;
    } else if (data.results && typeof data.results === "object") {
      // Grouped response (kanban etc.) – flatten all groups
      Object.values(data.results).forEach((group) => {
        if (Array.isArray(group)) {
          issues.push(...(group as TIssue[]));
        }
      });
    }

    // Build a compact fingerprint from issue metadata
    const fingerprint = issues
      .map((issue) => {
        const id = issue.id || "";
        const updated = issue.updated_at || "";
        const state = issue.state_id || "";
        const priority = issue.priority || "";
        const assignees = Array.isArray(issue.assignee_ids)
          ? issue.assignee_ids.join(",")
          : "";
        const labels = Array.isArray(issue.label_ids)
          ? issue.label_ids.join(",")
          : "";
        const name = issue.name || "";
        return `${id}|${updated}|${state}|${priority}|${assignees}|${labels}|${name}`;
      })
      .sort()
      .join("\n");

    return { fingerprint, issues };
  } catch (err) {
    log("Fetch error:", err);
    return null;
  }
}

/**
 * Silently merge issue data directly into the MobX issuesMap.
 *
 * This is the key difference from the previous approach:
 * - OLD: fetchIssuesWithExistingPagination → clear store → loader → re-fetch → re-render (visible flash)
 * - NEW: directly update issuesMap → MobX observers re-render only changed cells (invisible)
 *
 * The `addIssue` method on the IssueStore does exactly this:
 * - If the issue doesn't exist yet, it adds it
 * - If it already exists, it merges the new data into the existing issue
 * - MobX observers automatically pick up property changes
 */
function silentMergeIssues(issues: TIssue[]) {
  if (!issues || issues.length === 0) return;

  log(`Silently merging ${issues.length} issues into MobX store`);

  // Use the existing addIssue method which does a silent merge
  // This updates issuesMap without any loader, clear, or visible side effects
  rootStore.issue.issues.addIssue(issues);
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

/**
 * LiveSyncProvider – invisible component that polls for issue changes
 * and silently merges updates into the MobX store.
 *
 * Unlike the previous approach that used fetchIssuesWithExistingPagination
 * (which caused visible loading/flickering), this directly merges data
 * into issuesMap. MobX observers automatically re-render only the
 * specific cells/properties that changed – completely invisible to the user.
 *
 * Place this inside the StoreProvider tree (e.g. in provider.tsx).
 */
export const LiveSyncProvider = observer(function LiveSyncProvider() {
  const lastFingerprintRef = useRef<string | null>(null);
  const lastContextKeyRef = useRef<string | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const isPollingRef = useRef(false);

  // ─── Intercept own mutations to pause polling briefly ───
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = function (...args: Parameters<typeof fetch>) {
      const url =
        typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "";
      const method =
        (args[1]?.method || "GET").toUpperCase();

      // If WE are making a mutation, pause polling to avoid detecting our own change
      if (
        ["POST", "PATCH", "PUT", "DELETE"].includes(method) &&
        url.includes("/api/workspaces/") &&
        (url.includes("/issues") || url.includes("/work-items") ||
         url.includes("/cycle-issues") || url.includes("/module"))
      ) {
        log("Own mutation detected, pausing polling for", LIVE_SYNC_CONFIG.OWN_ACTION_PAUSE_MS, "ms");
        pauseUntilRef.current = Date.now() + LIVE_SYNC_CONFIG.OWN_ACTION_PAUSE_MS;
      }

      return originalFetch.apply(window, args);
    };

    return () => {
      // Restore original fetch on cleanup
      window.fetch = originalFetch;
    };
  }, []);

  // ─── Core polling function ───
  const pollForChanges = useCallback(async () => {
    // Prevent concurrent polls
    if (isPollingRef.current) return;

    // Check if we're paused (after own action or error backoff)
    if (Date.now() < pauseUntilRef.current) {
      log("Polling paused");
      return;
    }

    // Get current page context
    const ctx = getPageContext();
    if (!ctx) {
      log("Not on an issues page, skipping poll");
      lastFingerprintRef.current = null;
      return;
    }

    // Reset fingerprint if context changed (navigated to different project/view)
    const contextKey = JSON.stringify(ctx);
    if (lastContextKeyRef.current !== contextKey) {
      log("Context changed, resetting fingerprint");
      lastFingerprintRef.current = null;
      lastContextKeyRef.current = contextKey;
    }

    isPollingRef.current = true;

    try {
      const result = await fetchIssuesAndFingerprint(ctx);

      if (result === null) {
        consecutiveErrorsRef.current++;
        if (consecutiveErrorsRef.current >= LIVE_SYNC_CONFIG.MAX_CONSECUTIVE_ERRORS) {
          log("Too many errors, backing off for", LIVE_SYNC_CONFIG.ERROR_BACKOFF_MS, "ms");
          pauseUntilRef.current = Date.now() + LIVE_SYNC_CONFIG.ERROR_BACKOFF_MS;
        }
        isPollingRef.current = false;
        return;
      }

      consecutiveErrorsRef.current = 0;

      if (lastFingerprintRef.current === null) {
        // First poll – save baseline, don't trigger refresh
        lastFingerprintRef.current = result.fingerprint;
        log("Baseline fingerprint saved");
      } else if (result.fingerprint !== lastFingerprintRef.current) {
        // Change detected! Silently merge the data we already have
        log("🔄 Change detected! Silently merging", result.issues.length, "issues...");
        lastFingerprintRef.current = result.fingerprint;
        silentMergeIssues(result.issues);
      } else {
        log("No changes detected");
      }
    } catch (err) {
      log("Poll error:", err);
    }

    isPollingRef.current = false;
  }, []);

  // ─── Set up polling interval with visibility API ───
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer) return;
      log(`Starting polling (interval: ${LIVE_SYNC_CONFIG.POLL_INTERVAL_MS}ms)`);

      // Initial poll after a short delay (let the page load data first)
      const initialDelay = setTimeout(() => {
        pollForChanges();
      }, 3000);

      timer = setInterval(pollForChanges, LIVE_SYNC_CONFIG.POLL_INTERVAL_MS);

      return () => clearTimeout(initialDelay);
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log("Polling stopped");
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        log("Tab hidden, stopping polling");
        stopPolling();
      } else {
        log("Tab visible, resuming polling");
        // Reset fingerprint to force a fresh check
        lastFingerprintRef.current = null;
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Start polling immediately if tab is visible
    if (!document.hidden) {
      startPolling();
    }

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pollForChanges]);

  // This component renders nothing – it only runs side effects
  return null;
});

export default LiveSyncProvider;
