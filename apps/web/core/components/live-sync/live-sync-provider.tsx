import { useCallback, useEffect, useRef } from "react";
import { observer } from "mobx-react";
// plane imports
import { API_BASE_URL } from "@plane/constants";
// store
import { rootStore } from "@/lib/store-context";

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════
const LIVE_SYNC_CONFIG = {
  /** Polling interval in milliseconds */
  POLL_INTERVAL_MS: 10_000,
  /** Number of recent issues to check for changes */
  CHECK_COUNT: 20,
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
 * Fetch a lightweight fingerprint of recent issues from the API.
 * Returns a string hash representing the current state, or null on error.
 */
async function fetchFingerprint(ctx: PageContext): Promise<string | null> {
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
    let issues: Array<Record<string, unknown>> = [];

    if (data.results && Array.isArray(data.results)) {
      issues = data.results;
    } else if (Array.isArray(data)) {
      issues = data;
    } else if (data.results && typeof data.results === "object") {
      // Grouped response (kanban etc.) – flatten all groups
      Object.values(data.results).forEach((group) => {
        if (Array.isArray(group)) {
          issues.push(...(group as Array<Record<string, unknown>>));
        }
      });
    }

    // Build a compact fingerprint from issue metadata
    const fingerprint = issues
      .map((issue) => {
        const id = (issue.id as string) || "";
        const updated = (issue.updated_at as string) || "";
        const state = (issue.state_id as string) || (issue.state as string) || "";
        const priority = (issue.priority as string) || "";
        const assignees = Array.isArray(issue.assignee_ids)
          ? (issue.assignee_ids as string[]).join(",")
          : "";
        const labels = Array.isArray(issue.label_ids)
          ? (issue.label_ids as string[]).join(",")
          : "";
        return `${id}|${updated}|${state}|${priority}|${assignees}|${labels}`;
      })
      .sort()
      .join("\n");

    return fingerprint;
  } catch (err) {
    log("Fetch error:", err);
    return null;
  }
}

/**
 * Trigger a data refresh in the appropriate MobX store based on the current context.
 * This uses the existing `fetchIssuesWithExistingPagination` method which
 * re-fetches issues from the server and updates the MobX store reactively.
 */
function triggerStoreRefresh(ctx: PageContext) {
  const { workspaceSlug, projectId, cycleId, moduleId, viewId, section } = ctx;
  const issueRoot = rootStore.issue;

  try {
    switch (section) {
      case "cycles":
        if (cycleId) {
          log("Refreshing cycle issues:", cycleId);
          // Signature: (workspaceSlug, projectId, loadType, cycleId)
          issueRoot.cycleIssues.fetchIssuesWithExistingPagination(
            workspaceSlug,
            projectId,
            "mutation",
            cycleId
          );
        }
        break;

      case "modules":
        if (moduleId) {
          log("Refreshing module issues:", moduleId);
          // Signature: (workspaceSlug, projectId, loadType, moduleId)
          issueRoot.moduleIssues.fetchIssuesWithExistingPagination(
            workspaceSlug,
            projectId,
            "mutation",
            moduleId
          );
        }
        break;

      case "views":
        if (viewId) {
          log("Refreshing view issues:", viewId);
          // Signature: (workspaceSlug, projectId, viewId, loadType)
          issueRoot.projectViewIssues.fetchIssuesWithExistingPagination(
            workspaceSlug,
            projectId,
            viewId,
            "mutation"
          );
        }
        break;

      case "issues":
      default:
        log("Refreshing project issues");
        // Signature: (workspaceSlug, projectId, loadType)
        issueRoot.projectIssues.fetchIssuesWithExistingPagination(
          workspaceSlug,
          projectId,
          "mutation"
        );
        break;
    }
  } catch (err) {
    log("Store refresh error:", err);
  }
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

/**
 * LiveSyncProvider – invisible component that polls for issue changes
 * and triggers MobX store refreshes when remote changes are detected.
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
      const fingerprint = await fetchFingerprint(ctx);

      if (fingerprint === null) {
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
        lastFingerprintRef.current = fingerprint;
        log("Baseline fingerprint saved");
      } else if (fingerprint !== lastFingerprintRef.current) {
        // Change detected! Update fingerprint and refresh MobX store
        log("🔄 Change detected! Refreshing MobX store...");
        lastFingerprintRef.current = fingerprint;
        triggerStoreRefresh(ctx);
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
