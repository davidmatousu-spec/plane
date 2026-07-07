import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane helpers
import { MoreHorizontal, Star } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
// types
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue, IIssueDisplayProperties, IIssueMap } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { ControlLink, DropIndicator } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
// components
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { HIGHLIGHT_CLASS, getIssueBlockId } from "@/components/issues/issue-layouts/utils";
// helpers
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useKanbanView } from "@/hooks/store/use-kanban-view";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web components
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
// local components
import { IssueStats } from "@/plane-web/components/issues/issue-layouts/issue-stats";
import type { TRenderQuickActions } from "../list/list-view-types";
import { IssueProperties } from "../properties/all-properties";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";
import { parseDealers } from "@/components/issues/dealer-config";

interface IssueBlockProps {
  issueId: string;
  groupId: string;
  subGroupId: string;
  issuesMap: IIssueMap;
  displayProperties: IIssueDisplayProperties | undefined;
  draggableId: string;
  canDropOverIssue: boolean;
  canDragIssuesInCurrentGrouping: boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  scrollableContainerRef?: MutableRefObject<HTMLDivElement | null>;
  shouldRenderByDefault?: boolean;
  isEpic?: boolean;
  childIssueIds?: string[];
  isNested?: boolean;
}

interface IssueDetailsBlockProps {
  cardRef: React.RefObject<HTMLElement>;
  issue: TIssue;
  displayProperties: IIssueDisplayProperties | undefined;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  isReadOnly: boolean;
  isEpic?: boolean;
  isNested?: boolean;
}

const KanbanIssueDetailsBlock = observer(function KanbanIssueDetailsBlock(props: IssueDetailsBlockProps) {
  const { cardRef, issue, updateIssue, quickActions, isReadOnly, displayProperties, isEpic = false, isNested = false } = props;
  // refs
  const menuActionRef = useRef<HTMLDivElement | null>(null);
  // states
  const [isMenuActive, setIsMenuActive] = useState(false);
  // hooks
  const { isMobile } = usePlatformOS();

  const customActionButton = (
    <div
      ref={menuActionRef}
      className={`flex items-center h-full w-full cursor-pointer rounded-sm p-1 text-placeholder hover:bg-layer-1 ${
        isMenuActive ? "bg-layer-1 text-primary" : "text-secondary"
      }`}
      onClick={() => setIsMenuActive(!isMenuActive)}
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </div>
  );

  // derived values
  const subIssueCount = issue?.sub_issues_count ?? 0;

  const handleEventPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  useOutsideClickDetector(menuActionRef, () => setIsMenuActive(false));

  return (
    <>
      <div className="relative">
        {issue.project_id && (
          <IssueIdentifier
            issueId={issue.id}
            projectId={issue.project_id}
            size="xs"
            variant="tertiary"
            displayProperties={displayProperties}
          />
        )}
        <div
          className={cn("absolute -top-1 right-0", {
            "hidden group-hover/kanban-block:block": !isMobile,
            "!block": isMenuActive,
          })}
          onClick={handleEventPropagation}
        >
          {quickActions({
            issue,
            parentRef: cardRef,
            customActionButton,
          })}
        </div>
      </div>

      <Tooltip tooltipContent={issue.name} isMobile={isMobile} renderByDefault={false}>
        <div
          className={cn(
            "w-full line-clamp-1 text-body-sm-medium",
            issue.firmly_ordered ? "text-green-500" : "text-primary"
          )}
        >
          {issue.firmly_ordered && (
            <Star className="inline-block h-3.5 w-3.5 mr-1 -mt-0.5 shrink-0 text-green-500 fill-current" />
          )}
          <span>{issue.name}</span>
        </div>
      </Tooltip>

      <IssueProperties
        className="flex flex-wrap items-center gap-2 whitespace-nowrap text-tertiary pt-1.5 kanban-priority-props"
        issue={issue}
        displayProperties={displayProperties}
        activeLayout="Kanban"
        updateIssue={updateIssue}
        isReadOnly={isReadOnly}
        isEpic={isEpic}
      />

      {issue.dealer && parseDealers(issue.dealer).length > 0 && (
        <div className={cn("flex items-center gap-1.5 flex-wrap", isNested ? "pt-1" : "pt-1.5")}>
          {parseDealers(issue.dealer).map((dealerName) => (
            <div
              key={dealerName}
              className={cn(
                "flex items-center gap-1 rounded-full font-medium",
                isNested ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-xs"
              )}
              style={{
                backgroundColor: issue.dealer_paid ? "rgba(34, 197, 94, 0.12)" : "rgba(99, 102, 241, 0.12)",
                color: issue.dealer_paid ? "rgb(34, 197, 94)" : "rgb(129, 140, 248)",
              }}
            >
              {!isNested && (
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
              <span className={cn("truncate", isNested ? "max-w-[80px]" : "max-w-[120px]")}>{dealerName.split(" ")[0]}</span>
              {issue.dealer_paid && (
                <svg className={cn("shrink-0", isNested ? "h-2 w-2" : "h-3 w-3")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}

      {isEpic && displayProperties && (
        <WithDisplayPropertiesHOC
          displayProperties={displayProperties}
          displayPropertyKey="sub_issue_count"
          shouldRenderProperty={(properties) => !!properties.sub_issue_count && !!subIssueCount}
        >
          <IssueStats issueId={issue.id} className="mt-2 font-medium text-tertiary" />
        </WithDisplayPropertiesHOC>
      )}
    </>
  );
});

export const KanbanIssueBlock = observer(function KanbanIssueBlock(props: IssueBlockProps) {
  const {
    issueId,
    groupId,
    subGroupId,
    issuesMap,
    displayProperties,
    canDropOverIssue,
    canDragIssuesInCurrentGrouping,
    updateIssue,
    quickActions,
    canEditProperties,
    scrollableContainerRef,
    shouldRenderByDefault,
    isEpic = false,
    childIssueIds,
    isNested = false,
  } = props;

  const cardRef = useRef<HTMLAnchorElement | null>(null);
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // hooks
  const { getProjectIdentifierById } = useProject();
  const { getIsIssuePeeked } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);
  const { isMobile } = usePlatformOS();
  const { getProjectStates } = useProjectState();

  // handlers
  const handleIssuePeekOverview = (issue: TIssue) => handleRedirection(workspaceSlug, issue, isMobile);

  const issue = issuesMap[issueId];

  const { setIsDragging: setIsKanbanDragging } = useKanbanView();

  const [isDraggingOverBlock, setIsDraggingOverBlock] = useState(false);
  const [isCurrentBlockDragging, setIsCurrentBlockDragging] = useState(false);

  const canEditIssueProperties = canEditProperties(issue?.project_id ?? undefined);

  const isDragAllowed = canDragIssuesInCurrentGrouping && !issue?.tempId && canEditIssueProperties;
  const projectIdentifier = getProjectIdentifierById(issue?.project_id);

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issue?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issue?.sequence_id,
    isEpic,
    isArchived: !!issue?.archived_at,
  });

  useOutsideClickDetector(cardRef, () => {
    cardRef?.current?.classList?.remove(HIGHLIGHT_CLASS);
  });

  // Make Issue block both as as Draggable and,
  // as a DropTarget for other issues being dragged to get the location of drop
  useEffect(() => {
    const element = cardRef.current;

    if (!element) return;

    return combine(
      draggable({
        element,
        dragHandle: element,
        canDrag: () => isDragAllowed,
        getInitialData: () => ({ id: issue?.id, type: "ISSUE" }),
        onDragStart: () => {
          setIsCurrentBlockDragging(true);
          setIsKanbanDragging(true);
        },
        onDrop: () => {
          setIsKanbanDragging(false);
          setIsCurrentBlockDragging(false);
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source?.data?.id !== issue?.id && canDropOverIssue,
        getData: () => ({ id: issue?.id, type: "ISSUE" }),
        onDragEnter: () => {
          setIsDraggingOverBlock(true);
        },
        onDragLeave: () => {
          setIsDraggingOverBlock(false);
        },
        onDrop: () => {
          setIsDraggingOverBlock(false);
        },
      })
    );
  }, [cardRef?.current, issue?.id, isDragAllowed, canDropOverIssue, setIsCurrentBlockDragging, setIsDraggingOverBlock]);

  if (!issue) return null;

  // State color stripe for sub-issues: shows the PARENT's state color
  // so you can see which parent group the sub-issue belongs to
  const parentIssue = issue.parent_id ? issuesMap[issue.parent_id] : undefined;
  const stateColor = issue.parent_id
    ? parentIssue
      ? getProjectStates(parentIssue.project_id)?.find((s) => s.id === parentIssue.state_id)?.color || "#6b7280"
      : "#6b7280" // parent not loaded yet – use gray fallback
    : undefined;

  return (
    <>
      <DropIndicator isVisible={!isCurrentBlockDragging && isDraggingOverBlock} />
      <div
        id={`issue-${issueId}`}
        // make Z-index higher at the beginning of drag, to have a issue drag image of issue block without any overlaps
        className={cn("group/kanban-block relative", isNested ? "mb-1" : "mb-2", { "z-[1]": isCurrentBlockDragging })}
        onDragStart={() => {
          if (isDragAllowed) setIsCurrentBlockDragging(true);
          else {
            setToast({
              type: TOAST_TYPE.WARNING,
              title: "Cannot move work item",
              message: !canEditIssueProperties
                ? "You are not allowed to move this work item"
                : "Drag and drop is disabled for the current grouping",
            });
          }
        }}
      >
        <ControlLink
          id={getIssueBlockId(issueId, groupId, subGroupId)}
          href={workItemLink}
          ref={cardRef}
          className={cn(
            "block rounded-lg border outline-[0.5px] outline-transparent w-full border-subtle bg-layer-2 transition-all hover:border-strong",
            isNested
              ? "text-xs py-1.5 px-2 shadow-none hover:shadow-raised-100"
              : "text-13 p-3 shadow-raised-100 hover:shadow-raised-200",
            { "hover:cursor-pointer": isDragAllowed },
            { "border border-accent-strong hover:border-accent-strong": getIsIssuePeeked(issue.id) },
            { "bg-layer-1 z-[100]": isCurrentBlockDragging }
          )}
          style={{
            backgroundColor:
              issue.priority === "urgent"
                ? "rgba(239, 68, 68, 0.15)"
                : issue.priority === "high"
                  ? "rgba(249, 115, 22, 0.14)"
                  : issue.priority === "medium"
                    ? "rgba(234, 179, 8, 0.12)"
                    : issue.priority === "low"
                      ? "rgba(59, 130, 246, 0.12)"
                      : undefined,
            ...(stateColor
              ? { borderLeft: `3px solid ${stateColor}` }
              : {}),
          }}
          onClick={() => handleIssuePeekOverview(issue)}
          disabled={!!issue?.tempId}
        >
          <RenderIfVisible
            classNames="space-y-2"
            root={scrollableContainerRef}
            defaultHeight="100px"
            horizontalOffset={100}
            verticalOffset={200}
            defaultValue={shouldRenderByDefault}
          >
            <KanbanIssueDetailsBlock
              cardRef={cardRef}
              issue={issue}
              displayProperties={displayProperties}
              updateIssue={updateIssue}
              quickActions={quickActions}
              isReadOnly={!canEditIssueProperties}
              isEpic={isEpic}
              isNested={isNested}
            />
            {/* Show parent issue reference for standalone sub-issues (not nested) */}
            {!isNested && issue.parent_id && (
              <div className="flex items-center gap-1 pt-1 text-[10px] text-custom-text-400 truncate">
                <span>↑</span>
                {parentIssue ? (
                  <>
                    {parentIssue.project_id && (
                      <span className="shrink-0 font-medium">
                        {getProjectIdentifierById(parentIssue.project_id)}-{parentIssue.sequence_id}
                      </span>
                    )}
                    <span className="truncate">{parentIssue.name}</span>
                  </>
                ) : (
                  <span className="italic">sub-issue</span>
                )}
              </div>
            )}
          </RenderIfVisible>
        </ControlLink>

        {/* Nested sub-issues – rendered as full draggable blocks with indentation */}
        {childIssueIds && childIssueIds.length > 0 && (
          <div className="mt-1 space-y-1 w-3/4 ml-auto">
            {childIssueIds.map((childId) => {
              if (!childId) return null;

              let childDraggableId = childId;
              if (groupId) childDraggableId = `${childDraggableId}__${groupId}`;
              if (subGroupId) childDraggableId = `${childDraggableId}__${subGroupId}`;

              return (
                <KanbanIssueBlock
                  key={childDraggableId}
                  issueId={childId}
                  groupId={groupId}
                  subGroupId={subGroupId}
                  shouldRenderByDefault
                  issuesMap={issuesMap}
                  displayProperties={displayProperties}
                  updateIssue={updateIssue}
                  quickActions={quickActions}
                  draggableId={childDraggableId}
                  canDropOverIssue={canDropOverIssue}
                  canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
                  canEditProperties={canEditProperties}
                  scrollableContainerRef={scrollableContainerRef}
                  isEpic={isEpic}
                  isNested
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
});
