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

// Import hooku pro uživatele
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

// Vlastní ikonka bankovky
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

// Ikonka pro Obchodníka (Dealer)
const DealerPropertyIcon = (props: any) => (
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
    <path d="M3 21l18 0" />
    <path d="M5 21v-7l8 -4l8 4v7" />
    <path d="M19 10l0 -4.05c0 -.526 -.403 -.968 -.923 -1.03l-5.184 -.617a2.997 2.997 0 0 0 -3.766 1.636l-.127 .361" />
  </svg>
);



// --- KONFIGURACE OPRÁVNĚNÍ ---
const ALLOWED_USERS = [
  "d670304d-4017-4dd2-9641-6966fa60352a", // VAŠE ID (Nejbezpečnější)
  "david.matousu@gmail.com",  
  "tereza.plechackova@onixia-pasport.cz",                
  "adam.bosak@onixia.cz",
  "jan.pertl@onixia.cz",
  "josef.sankot@onixia-pasport.cz"
];


// Oprávnění pro Budget Complete (Vyčerpáno) - pouze vybraní uživatelé
const ALLOWED_BUDGET_COMPLETE_USERS = [
  "adam.bosak@onixia.cz",
  "david.matousu@gmail.com", 
];

const ALLOWED_CONTACT_VIEWERS: string[] = []; // Prázdné = vidí všichni



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
  const userProfileStore = useUserProfile();
  
  // Bezpečné získání dat z MobX Store (podle vašeho logu)
  // Zkoušíme cestu: store -> user -> data, nebo fallback přímo na .data
  // @ts-ignore
  const currentUserData = userProfileStore?.store?.user?.data || userProfileStore?.data;

  const { getProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();

  // 2. Definice Issue
  const issue = getIssueById(issueId);

  // --- 3. BUDGET LOGIKA ---
  const [displayValue, setDisplayValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Získáme identifikátory aktuálního uživatele
  const currentUserId = currentUserData?.id;
  const currentUserEmail = currentUserData?.email?.toLowerCase();

  // Ověření oprávnění (ID nebo Email)
  const isAllowed = ALLOWED_USERS.some(allowed => {
      const allowedLower = allowed.toLowerCase();
      return allowedLower === currentUserId || allowedLower === currentUserEmail;
  });

  // Zobrazit pouze pokud je uživatel oprávněn
  const showBudget = Boolean(isAllowed);

  // Kontrola oprávnění pro Budget Complete
  const isBudgetCompleteAllowed = ALLOWED_BUDGET_COMPLETE_USERS.some(allowed => {
      const allowedLower = allowed.toLowerCase();
      return allowedLower === currentUserId || allowedLower === currentUserEmail;
  });

  const showBudgetComplete = Boolean(isBudgetCompleteAllowed);

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

  // --- BUDGET COMPLETE (Vyčerpáno) LOGIKA ---
  const [displayValueComplete, setDisplayValueComplete] = useState("");
  const [isEditingComplete, setIsEditingComplete] = useState(false);

  useEffect(() => {
    if (!isEditingComplete && issue) {
      setDisplayValueComplete(formatMoney(issue.budget_complete));
    }
  }, [issue?.budget_complete, isEditingComplete]);

  const handleFocusComplete = () => {
    setIsEditingComplete(true);
    setDisplayValueComplete(issue?.budget_complete?.toString() ?? "");
  };

  const handleChangeComplete = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValueComplete(e.target.value);
  };

  const handleBlurComplete = async () => {
    setIsEditingComplete(false);
    const rawValue = displayValueComplete.replace(/[^\d]/g, '');
    const numVal = rawValue === "" ? null : Number(rawValue);

    if (issue && numVal !== issue.budget_complete) {
      try {
        await issueOperations.update(workspaceSlug, projectId, issueId, { budget_complete: numVal });
        setDisplayValueComplete(formatMoney(numVal));
      } catch (err) {
        console.error("Budget complete save failed", err);
        setDisplayValueComplete(formatMoney(issue.budget_complete));
      }
    } else {
      setDisplayValueComplete(formatMoney(numVal));
    }
  };
  // ----------------------------------------------------

  // --- 4. CONTACT PERSON LOGIKA ---
  const [contactPerson, setContactPerson] = useState(issue?.contact_person ?? "");
  const [isContactEditing, setIsContactEditing] = useState(false);

  // Oprávnění (pokud je pole prázdné, vidí všichni)
  const showContactPerson = ALLOWED_CONTACT_VIEWERS.length === 0 || ALLOWED_CONTACT_VIEWERS.includes(currentUserId ?? "");

  // Synchronizace s DB
  useEffect(() => {
    if (!isContactEditing) {
      setContactPerson(issue?.contact_person ?? "");
    }
  }, [issue?.contact_person, isContactEditing]);

  // Uložení
  const submitContactPerson = async () => {
    setIsContactEditing(false);
    const val = contactPerson.trim();
    
    if (val === (issue?.contact_person ?? "")) return;

    try {
      await issueOperations.update(workspaceSlug, projectId, issueId, {
        contact_person: val,
      });
    } catch (error) {
      console.error(error);
      setContactPerson(issue?.contact_person ?? "");
    }
  };
  // --------------------------------
  
  // --- 5. DEALER (OBCHODNÍK) LOGIKA ---
  const [dealer, setDealer] = useState(issue?.dealer ?? "");
  const [isDealerEditing, setIsDealerEditing] = useState(false);
  const showDealer = true;

  // Synchronizace s DB
  useEffect(() => {
    if (!isDealerEditing) {
      setDealer(issue?.dealer ?? "");
    }
  }, [issue?.dealer, isDealerEditing]);

  // Uložení
  const submitDealer = async () => {
    setIsDealerEditing(false);
    const val = dealer.trim();
    
    if (val === (issue?.dealer ?? "")) return;

    try {
      await issueOperations.update(workspaceSlug, projectId, issueId, {
        dealer: val,
      });
    } catch (error) {
      console.error(error);
      setDealer(issue?.dealer ?? "");
    }
  };


  if (!issue) return <></>;

  const createdByDetails = getUserDetails(issue?.created_by);
  const projectDetails = getProjectById(issue.project_id);
  const isEstimateEnabled = projectDetails?.estimate;
  const stateDetails = getStateById(issue.state_id);

  const minDate = getDate(issue.start_date);
  minDate?.setDate(minDate.getDate());

  const maxDate = getDate(issue.target_date);
  maxDate?.setDate(maxDate.getDate());

  return (
    <div>
      <h6 className="text-body-xs-medium">{t("common.properties")}</h6>
      <div className={`w-full space-y-3 mt-3 ${disabled ? "opacity-60" : ""}`}>
        {/* --- CONTACT PERSON INPUT --- */}
        {showContactPerson && (
          <SidebarPropertyListItem 
            icon={UserCirclePropertyIcon} // POUŽITO SPRÁVNĚ (bez < >)
            label="Contact Person"
          >
              <div className="w-full h-7.5 flex items-center group">
                <input
                  type="text" 
                  className="w-full bg-transparent text-left text-body-xs-medium text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none rounded px-0 py-0.5"
                  placeholder="Add name..."
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  onFocus={() => setIsContactEditing(true)}
                  onBlur={submitContactPerson}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  disabled={disabled} // V properties.tsx se používá "disabled"
                />
                
                {/* Ikonka tužky */}
                {!isContactEditing && !contactPerson && !disabled && (
                    <span className="hidden group-hover:inline text-custom-text-400 ml-auto pr-2">
                      ✎
                    </span>
                )}
              </div>
          </SidebarPropertyListItem>
        )}
        
        {/* --- DEALER / OBCHODNÍK INPUT --- */}
        {showDealer && (
          <SidebarPropertyListItem 
            icon={DealerPropertyIcon} 
            label="Obchodník"
          >
              <div className="w-full h-7.5 flex items-center group">
                <input
                  type="text" 
                  className="w-full bg-transparent text-left text-body-xs-medium text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none rounded px-0 py-0.5"
                  placeholder="Vybrat obchodníka..."
                  value={dealer}
                  onChange={(e) => setDealer(e.target.value)}
                  onFocus={() => setIsDealerEditing(true)}
                  onBlur={submitDealer}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  disabled={disabled}
                />
                
                {/* Ikonka tužky */}
                {!isDealerEditing && !dealer && !disabled && (
                    <span className="hidden group-hover:inline text-custom-text-400 ml-auto pr-2">
                      ✎
                    </span>
                )}
              </div>
          </SidebarPropertyListItem>
        )}
        
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

        {/* --- BUDGET INPUT (FINAL) --- */}
        {showBudget && (
          <SidebarPropertyListItem icon={BudgetPropertyIcon} label="Rozpočet">
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
          </SidebarPropertyListItem>
        )}

        {/* --- BUDGET COMPLETE (Vyčerpáno) --- */}
        {showBudgetComplete && (
          <SidebarPropertyListItem icon={BudgetPropertyIcon} label="Náklady celkem">
              <div className="w-full h-7.5 flex items-center">
                <input
                  type="text"
                  className="w-full bg-transparent text-left text-body-xs-medium text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none rounded px-0 py-0.5"
                  placeholder="-"
                  value={displayValueComplete}
                  onFocus={handleFocusComplete}
                  onChange={handleChangeComplete}
                  onBlur={handleBlurComplete}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  disabled={disabled}
                />
              </div>
          </SidebarPropertyListItem>
        )}
        
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