import { useState, useEffect } from "react";
import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// ui icons
import {
  CycleIcon,
  StatePropertyIcon,
  ModuleIcon,
  MembersPropertyIcon,
  PriorityPropertyIcon,
  StartDatePropertyIcon,
  DueDatePropertyIcon,
  LabelPropertyIcon,
  UserCirclePropertyIcon,
  EstimatePropertyIcon,
  ParentPropertyIcon,
} from "@plane/propel/icons";
import { cn, getDate, renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// helpers
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";

// ---> FINÁLNÍ IMPORT (s aliasem @) <---
import { useUserProfile } from "@/hooks/store/user/user-user-profile";

// plane web components
import { WorkItemAdditionalSidebarProperties } from "@/plane-web/components/issues/issue-details/additional-properties";
import { IssueParentSelectRoot } from "@/plane-web/components/issues/issue-details/parent-select-root";
import { DateAlert } from "@/plane-web/components/issues/issue-details/sidebar/date-alert";
import { TransferHopInfo } from "@/plane-web/components/issues/issue-details/sidebar/transfer-hop-info";
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
import type { TIssueOperations } from "../issue-detail";
import { IssueCycleSelect } from "../issue-detail/cycle-select";
import { IssueLabel } from "../issue-detail/label";
import { IssueModuleSelect } from "../issue-detail/module-select";

// Vlastní ikonka bankovky/rozpočtu ve stylu Plane
const BudgetPropertyIcon = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("size-3.5", props.className)}
    {...props}
  >
    <rect width="20" height="12" x="2" y="6" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

// SEZNAM POVOLENÝCH EMAILŮ
const ALLOWED_BUDGET_EMAILS = [
  "jan.novak@firma.cz",
  "petr.sef@firma.cz",
  "finance@firma.cz",
  "david.matousu@gmail.com", 
  "vas.email@zde.cz" 
];

interface IPeekOverviewProperties {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueOperations: TIssueOperations;
}

export const PeekOverviewProperties = observer(function PeekOverviewProperties(props: IPeekOverviewProperties) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;
  const { t } = useTranslation();
  
  // 1. Hooky
  const { getProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();

  // ---> ZMĚNA: Uložíme si celý výsledek hooku do proměnné, abychom ho prozkoumali
  const userProfileRaw = useUserProfile(); 
  // Zkusíme odhadnout, kde by data mohla být (pro jistotu)
  // Někdy je to přímo ten objekt, někdy je to v .data, někdy v .user
  const currentUser = userProfileRaw?.data || userProfileRaw?.user || userProfileRaw;

  // 2. Definice Issue
  const issue = getIssueById(issueId);

  // --- 3. BUDGET LOGIKA ---
  const [displayValue, setDisplayValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Převedeme na string pro bezpečné porovnání
  const userEmail = currentUser?.email?.toLowerCase();
  const isAllowed = userEmail && ALLOWED_BUDGET_EMAILS.some(e => e.toLowerCase() === userEmail);
  
  // Pro účely ladění zobrazíme input VŽDY, ale s informací, jestli by byl povolen
  const showBudget = true; 

  const formatMoney = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return "";
    return val.toLocaleString("cs-CZ") + " Kč";
  };

  useEffect(() => {
    if (!isEditing && issue) {
       setDisplayValue(formatMoney(issue.budget));
    }
  }, [issue?.budget, isEditing]);

  const handleFocus = () => {
    setIsEditing(true);
    setDisplayValue(issue?.budget?.toString() ?? "");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value);
  };

  const handleBlur = async () => {
    setIsEditing(false);
    const rawValue = displayValue.replace(/[^\d]/g, ''); 
    const numVal = rawValue === "" ? null : Number(rawValue);

    if (issue && numVal !== issue.budget) {
        try {
            await issueOperations.update(workspaceSlug, projectId, issueId, { budget: numVal });
            setDisplayValue(formatMoney(numVal));
        } catch (err) {
            console.error("Budget save failed", err);
            setDisplayValue(formatMoney(issue.budget));
        }
    } else {
        setDisplayValue(formatMoney(numVal));
    }
  };
  // ----------------------------------------------------

  // 4. Guard
  if (!issue) return <></>;

  // 5. Zbytek proměnných
  const createdByDetails = getUserDetails(issue?.created_by);
  const projectDetails = getProjectById(issue.project_id);
  const isEstimateEnabled = projectDetails?.estimate;
  const stateDetails = getStateById(issue.state_id);

  const minDate = getDate(issue.start_date);
  minDate?.setDate(minDate.getDate());

  const maxDate = getDate(issue.target_date);
  maxDate?.setDate(maxDate.getDate());

  // Pro jistotu si to vypíšeme do KONZOLE (F12), tam to aplikaci neshodí
  console.log("🔍 DEBUG USER PROFILE:", userProfileRaw);

  return (
    <div>
      <h6 className="text-body-xs-medium">{t("common.properties")}</h6>
      <div className={`w-full space-y-3 mt-3 ${disabled ? "opacity-60" : ""}`}>
        <SidebarPropertyListItem icon={StatePropertyIcon} label={t("common.state")}>
          <StateDropdown
            value={issue?.state_id}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
            projectId={projectId}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            className="w-full grow group"
            buttonContainerClassName="w-full text-left h-7.5"
            buttonClassName={`text-body-xs-medium ${issue?.state_id ? "" : "text-placeholder"}`}
            dropdownArrow
            dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
          />
        </SidebarPropertyListItem>

        <SidebarPropertyListItem icon={MembersPropertyIcon} label={t("common.assignees")}>
          <MemberDropdown
            value={issue?.assignee_ids ?? undefined}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
            disabled={disabled}
            projectId={projectId}
            placeholder={t("issue.add.assignee")}
            multiple
            buttonVariant={issue?.assignee_ids?.length > 1 ? "transparent-without-text" : "transparent-with-text"}
            className="w-full grow group"
            buttonContainerClassName="w-full text-left h-7.5"
            buttonClassName={`text-body-xs-medium justify-between ${issue?.assignee_ids?.length > 0 ? "" : "text-placeholder"}`}
            hideIcon={issue.assignee_ids?.length === 0}
            dropdownArrow
            dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
          />
        </SidebarPropertyListItem>

        <SidebarPropertyListItem icon={PriorityPropertyIcon} label={t("common.priority")}>
          <PriorityDropdown
            value={issue?.priority}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            className="w-full h-7.5 grow rounded-sm"
            buttonContainerClassName="w-full text-left h-7.5"
            buttonClassName={`text-body-xs-medium whitespace-nowrap [&_svg]:size-3.5 ${!issue?.priority || issue?.priority === "none" ? "text-placeholder" : ""}`}
          />
        </SidebarPropertyListItem>


        {createdByDetails && (
          <SidebarPropertyListItem
            icon={UserCirclePropertyIcon}
            label={t("common.created_by")}
            childrenClassName="px-2"
          >
            <ButtonAvatars
              showTooltip
              userIds={createdByDetails?.display_name.includes("-intake") ? null : createdByDetails?.id}
            />
            <span className="grow truncate text-body-xs-medium text-secondary leading-5">
              {createdByDetails?.display_name.includes("-intake") ? "Plane" : createdByDetails?.display_name}
            </span>
          </SidebarPropertyListItem>
        )}

        <SidebarPropertyListItem icon={StartDatePropertyIcon} label={t("common.order_by.start_date")}>
          <DateDropdown
            value={issue.start_date}
            onChange={(val) =>
              issueOperations.update(workspaceSlug, projectId, issueId, {
                start_date: val ? renderFormattedPayloadDate(val) : null,
              })
            }
            placeholder={t("issue.add.start_date")}
            buttonVariant="transparent-with-text"
            maxDate={maxDate ?? undefined}
            disabled={disabled}
            className="w-full grow group"
            buttonContainerClassName="w-full text-left h-7.5"
            buttonClassName={`text-body-xs-medium ${issue?.start_date ? "" : "text-placeholder"}`}
            hideIcon
            clearIconClassName="h-3 w-3 hidden group-hover:inline"
          />
        </SidebarPropertyListItem>

        <SidebarPropertyListItem icon={DueDatePropertyIcon} label={t("common.order_by.due_date")}>
          <div className="flex items-center gap-2 w-full">
            <DateDropdown
              value={issue.target_date}
              onChange={(val) =>
                issueOperations.update(workspaceSlug, projectId, issueId, {
                  target_date: val ? renderFormattedPayloadDate(val) : null,
                })
              }
              placeholder={t("issue.add.due_date")}
              buttonVariant="transparent-with-text"
              minDate={minDate ?? undefined}
              disabled={disabled}
              className="w-full grow group"
              buttonContainerClassName="w-full text-left h-7.5"
              buttonClassName={cn("text-body-xs-medium", {
                "text-placeholder": !issue.target_date,
                "text-danger-primary": shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group),
              })}
              hideIcon
              clearIconClassName="h-3 w-3 hidden group-hover:inline text-primary"
            />
            {issue.target_date && <DateAlert date={issue.target_date} workItem={issue} projectId={projectId} />}
          </div>
        </SidebarPropertyListItem>

        {isEstimateEnabled && (
          <SidebarPropertyListItem icon={EstimatePropertyIcon} label={t("common.estimate")}>
            <EstimateDropdown
              value={issue.estimate_point ?? undefined}
              onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })}
              projectId={projectId}
              disabled={disabled}
              buttonVariant="transparent-with-text"
              className="w-full grow group"
              buttonContainerClassName="w-full text-left h-7.5"
              buttonClassName={`text-body-xs-medium ${issue?.estimate_point !== undefined ? "" : "text-placeholder"}`}
              placeholder="None"
              hideIcon
              dropdownArrow
              dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
            />
          </SidebarPropertyListItem>
        )}

        {projectDetails?.module_view && (
          <SidebarPropertyListItem icon={ModuleIcon} label={t("common.modules")}>
            <IssueModuleSelect
              className="w-full grow"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={disabled}
            />
          </SidebarPropertyListItem>
        )}

        {projectDetails?.cycle_view && (
          <SidebarPropertyListItem
            icon={CycleIcon}
            label={t("common.cycle")}
            appendElement={<TransferHopInfo workItem={issue} />}
          >
            <IssueCycleSelect
              className="w-full grow h-7.5"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={disabled}
            />
          </SidebarPropertyListItem>
        )}

        <SidebarPropertyListItem icon={ParentPropertyIcon} label={t("common.parent")}>
          <IssueParentSelectRoot
            className="w-full h-7.5 grow"
            disabled={disabled}
            issueId={issueId}
            issueOperations={issueOperations}
            projectId={projectId}
            workspaceSlug={workspaceSlug}
          />
        </SidebarPropertyListItem>

        <SidebarPropertyListItem icon={LabelPropertyIcon} label={t("common.labels")}>
          <IssueLabel workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} disabled={disabled} />
        </SidebarPropertyListItem>

        {/* --- BUDGET INPUT --- */}
          <SidebarPropertyListItem icon={BudgetPropertyIcon} label="Rozpočet">
              <div className="w-full flex flex-col">
                
                {/* OPRAVENÝ DEBUG INFO - BEZ NEBEZPEČNÉHO JSON.STRINGIFY */}
                <div className="text-[10px] text-red-500 bg-red-50 border border-red-200 p-1 mb-1 overflow-hidden break-all">
                    <strong>DIAGNOSTIKA:</strong><br/>
                    {/* Vypíšeme jen klíče (to je bezpečné) */}
                    Keys: {JSON.stringify(Object.keys(userProfileRaw || {}))}<br/>
                    Email found: {userEmail || "NENALEZEN"}<br/>
                    <span className="font-bold">PRO PLNY VYPIS ZMACKNI F12 A PODIVEJ SE DO KONZOLE</span>
                </div>
                {/* ------------------------------- */}

                {showBudget ? (
                    <div className="w-full h-7.5 flex items-center">
                        <input
                        type="text" 
                        className="w-full bg-transparent text-left text-body-xs-medium text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none rounded px-0 py-0.5"
                        placeholder="-"
                        value={displayValue}
                        onFocus={handleFocus}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        disabled={disabled}
                        />
                    </div>
                ) : (
                    <span className="text-body-xs text-gray-400 italic">Skryto (Email: {userEmail})</span>
                )}
              </div>
          </SidebarPropertyListItem>
        
        <IssueWorklogProperty
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          disabled={disabled}
        />

        <WorkItemAdditionalSidebarProperties
          workItemId={issue.id}
          workItemTypeId={issue.type_id}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
          isEditable={!disabled}
          isPeekView
        />
      </div>
    </div>
  );
});