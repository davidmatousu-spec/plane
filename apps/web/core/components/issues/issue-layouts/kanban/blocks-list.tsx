import type { MutableRefObject } from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TIssue, IIssueDisplayProperties, IIssueMap } from "@plane/types";
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

  // Safety net: re-render shortly after issueIds changes so that any
  // parent_id values that arrive asynchronously are picked up.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setTick((t) => t + 1), 300);
    return () => clearTimeout(timer);
  }, [issueIds.length]);

  // Build parent→children map: for each issue in this column,
  // if it has a parent_id AND that parent is also in this same column,
  // treat it as a nested child (don't render it as a top-level card).
  // IMPORTANT: Only nest when parent appears BEFORE child in the sorted list,
  // so the child moves UP (stays visible). If parent is below, keep child standalone.
  // NOTE: No useMemo here – MobX observer needs to track issuesMap property access directly.
  const childToParent = new Map<string, string>();
  const idsInColumn = new Set(issueIds);

  // Build index map for position comparison
  const positionMap = new Map<string, number>();
  issueIds.forEach((id, idx) => positionMap.set(id, idx));

  for (const issueId of issueIds) {
    const issue = issuesMap[issueId];
    if (issue?.parent_id && idsInColumn.has(issue.parent_id)) {
      const parentPos = positionMap.get(issue.parent_id) ?? Infinity;
      const childPos = positionMap.get(issueId) ?? Infinity;
      // Only nest if parent comes BEFORE child (child moves up, not off-screen)
      if (parentPos < childPos) {
        const parentIssue = issuesMap[issue.parent_id];
        // If parent is loaded, verify state matches (prevents stale duplicates during drag).
        // If parent is NOT loaded yet (pagination), trust column grouping – same column = same state.
        if (!parentIssue || issue.state_id === parentIssue.state_id) {
          childToParent.set(issueId, issue.parent_id);
        }
      }
    }
  }

  const topLevelIds = issueIds.filter((id) => !childToParent.has(id));

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
