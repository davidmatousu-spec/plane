import type { MutableRefObject } from "react";
import { useMemo } from "react";
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

  // Build parent→children map: for each issue in this column,
  // if it has a parent_id AND that parent is also in this same column,
  // treat it as a nested child (don't render it as a top-level card).
  const { topLevelIds, childrenByParent } = useMemo(() => {
    const parentIdsInColumn = new Set<string>();
    const childToParent = new Map<string, string>();

    // First pass: collect all issue IDs in this column
    const idsInColumn = new Set(issueIds);

    // Second pass: identify children whose parent is also in this column
    for (const issueId of issueIds) {
      const issue = issuesMap[issueId];
      if (issue?.parent_id && idsInColumn.has(issue.parent_id)) {
        childToParent.set(issueId, issue.parent_id);
        parentIdsInColumn.add(issue.parent_id);
      }
    }

    // Top-level = not a child of anyone in this column
    const topLevel = issueIds.filter((id) => !childToParent.has(id));

    // Group children by parent
    const byParent: Record<string, string[]> = {};
    for (const [childId, parentId] of childToParent) {
      if (!byParent[parentId]) byParent[parentId] = [];
      byParent[parentId].push(childId);
    }

    return { topLevelIds: topLevel, childrenByParent: byParent };
  }, [issueIds, issuesMap]);

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
