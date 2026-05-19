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

  // Build parent→children map.
  // Due to pagination, issueIds may not contain ALL issues in this column.
  // A child may be loaded (in issueIds) but its parent may not be (still paginated).
  // Strategy:
  //   1. If parent IS in issueIds → nest child under parent (normal case)
  //   2. If parent is NOT in issueIds but IS in issuesMap with same state → inject parent, nest child
  //   3. If parent is not available at all → leave child standalone
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
