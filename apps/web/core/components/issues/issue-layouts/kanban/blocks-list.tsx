import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import type { TIssue, IIssueDisplayProperties, IIssueMap } from "@plane/types";
// store
import { rootStore } from "@/lib/store-context";
// local imports
import type { TRenderQuickActions } from "../list/list-view-types";
import { KanbanIssueBlock } from "./block";

interface IssueBlocksListProps {
  sub_group_id: string;
  groupId: string;
  issuesMap: IIssueMap;
  issueIds: string[];
  displayProperties: IIssueDisplayProperties | undefined;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  canDropOverIssue: boolean;
  canDragIssuesInCurrentGrouping: boolean;
  scrollableContainerRef?: MutableRefObject<HTMLDivElement | null>;
  isEpic?: boolean;
}

export const KanbanIssueBlocksList = observer(function KanbanIssueBlocksList(props: IssueBlocksListProps) {
  const {
    sub_group_id,
    groupId,
    issuesMap,
    issueIds,
    displayProperties,
    canDropOverIssue,
    canDragIssuesInCurrentGrouping,
    updateIssue,
    quickActions,
    canEditProperties,
    scrollableContainerRef,
    isEpic = false,
  } = props;

  const { workspaceSlug } = useParams();

  // Track which parent IDs we've already requested to avoid re-fetching
  const fetchedParentsRef = useRef<Set<string>>(new Set());

  // Safety net: re-render shortly after issueIds changes so that any
  // parent_id values that arrive asynchronously are picked up.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setTick((t) => t + 1), 300);
    return () => clearTimeout(timer);
  }, [issueIds.length]);

  // Auto-fetch missing parent issues that aren't in issuesMap yet (due to pagination).
  // When loaded, MobX triggers re-render → injection picks them up → nesting works.
  useEffect(() => {
    if (!workspaceSlug) return;

    const missingParents: { parentId: string; projectId: string }[] = [];

    for (const issueId of issueIds) {
      const issue = issuesMap[issueId];
      if (
        issue?.parent_id &&
        !issuesMap[issue.parent_id] &&
        !fetchedParentsRef.current.has(issue.parent_id) &&
        issue.project_id
      ) {
        missingParents.push({ parentId: issue.parent_id, projectId: issue.project_id });
        fetchedParentsRef.current.add(issue.parent_id);
      }
    }

    if (missingParents.length === 0) return;

    // Group by project for batch fetch
    const byProject = new Map<string, string[]>();
    for (const { parentId, projectId } of missingParents) {
      if (!byProject.has(projectId)) byProject.set(projectId, []);
      byProject.get(projectId)!.push(parentId);
    }

    const issueStoreInstance = rootStore.issue.issues;

    for (const [projectId, parentIds] of byProject) {
      issueStoreInstance.getIssues(workspaceSlug as string, projectId, parentIds).catch(() => {
        // If fetch fails, allow retry later
        parentIds.forEach((id) => fetchedParentsRef.current.delete(id));
      });
    }
  }, [issueIds, issuesMap, workspaceSlug]);

  // Build parent→children map.
  // Due to pagination, issueIds may not contain ALL issues in this column.
  // A child may be loaded (in issueIds) but its parent may not be (still paginated).
  // Strategy:
  //   1. If parent IS in issueIds → nest child under parent
  //   2. If parent is NOT in issueIds but IS in issuesMap with same state → inject parent, nest child
  //   3. If parent is not available at all → leave child standalone (fetch triggered above)
  const childToParent = new Map<string, string>();
  const idsInColumn = new Set(issueIds);
  const parentIdsToInject = new Set<string>();

  for (const issueId of issueIds) {
    const issue = issuesMap[issueId];
    if (!issue?.parent_id) continue;

    if (idsInColumn.has(issue.parent_id)) {
      // Parent is already in issueIds → nest normally
      childToParent.set(issueId, issue.parent_id);
    } else {
      // Parent not in issueIds (pagination). Check if parent is loaded in issuesMap
      // and belongs to this column (same state = same groupId)
      const parentIssue = issuesMap[issue.parent_id];
      if (parentIssue && parentIssue.state_id === groupId) {
        childToParent.set(issueId, issue.parent_id);
        parentIdsToInject.add(issue.parent_id);
      }
    }
  }

  // Build final top-level list: original issues minus nested children, plus injected parents
  const topLevelIds = [
    ...issueIds.filter((id) => !childToParent.has(id)),
    ...Array.from(parentIdsToInject),
  ];

  const childrenByParent: Record<string, string[]> = {};
  for (const [childId, parentId] of childToParent) {
    if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
    childrenByParent[parentId].push(childId);
  }

  return (
    <>
      {topLevelIds && topLevelIds.length > 0 ? (
        <>
          {topLevelIds.map((issueId, index) => {
            if (!issueId) return null;

            let draggableId = issueId;
            if (groupId) draggableId = `${draggableId}__${groupId}`;
            if (sub_group_id) draggableId = `${draggableId}__${sub_group_id}`;

            return (
              <KanbanIssueBlock
                key={draggableId}
                issueId={issueId}
                groupId={groupId}
                subGroupId={sub_group_id}
                shouldRenderByDefault={index <= 10}
                issuesMap={issuesMap}
                displayProperties={displayProperties}
                updateIssue={updateIssue}
                quickActions={quickActions}
                draggableId={draggableId}
                canDropOverIssue={canDropOverIssue}
                canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
                canEditProperties={canEditProperties}
                scrollableContainerRef={scrollableContainerRef}
                isEpic={isEpic}
                childIssueIds={childrenByParent[issueId]}
              />
            );
          })}
        </>
      ) : null}
    </>
  );
});
