import { useState, useEffect } from "react";
import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// ui
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
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";

// ---> NOVÝ IMPORT <---
import { useUserProfile } from "@/hooks/store/user/user-user-profile";

// plane web components
// components
import { WorkItemAdditionalSidebarProperties } from "@/plane-web/components/issues/issue-details/additional-properties";
import { IssueParentSelectRoot } from "@/plane-web/components/issues/issue-details/parent-select-root";
import { DateAlert } from "@/plane-web/components/issues/issue-details/sidebar/date-alert";
import { TransferHopInfo } from "@/plane-web/components/issues/issue-details/sidebar/transfer-hop-info";
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { IssueCycleSelect } from "./cycle-select";
import { IssueLabel } from "./label";
import { IssueModuleSelect } from "./module-select";
import type { TIssueOperations } from "./root";
import { DealerDropdown } from "@/components/issues/dealer-dropdown";

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
    className={cn("size-3.5", props.className)} // Velikost 3.5 sedí k ostatním
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

// Ikonka hvězdičky pro "Závazně objednáno"
const FirmlyOrderedPropertyIcon = (props: any) => (
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
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);


// --- KONFIGURACE OPRÁVNĚNÍ ---
const ALLOWED_USERS = [
  "d670304d-4017-4dd2-9641-6966fa60352a", // VAŠE ID
  "david.matousu@gmail.com",             // Váš email
  "tereza.plechackova@onixia-pasport.cz",  
  "adam.bosak@onixia.cz",
  "jan.pertl@onixia.cz",
  "josef.sankot@onixia-pasport.cz",
  "samuel.misik@onixia-pasport.cz"
];

// Oprávnění pro Budget Complete (Vyčerpáno) - pouze vybraní uživatelé
const ALLOWED_BUDGET_COMPLETE_USERS = [
  "adam.bosak@onixia.cz",
  "david.matousu@gmail.com",  
];


const ALLOWED_CONTACT_VIEWERS: string[] = [
    // "tvoje-id", 
];

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  isEditable: boolean;
};

export const IssueDetailsSidebar = observer(function IssueDetailsSidebar(props: Props) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId, issueId, issueOperations, isEditable } = props;
  
  // store hooks
  const { getProjectById } = useProject();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  
  // 1. Hooky
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  
  const { getUserDetails } = useMember();
  const { getStateById } = useProjectState();

  // ---> ZÍSKÁNÍ UŽIVATELE (stejně jako v properties.tsx) <---
  const userProfileStore = useUserProfile();
  // @ts-ignore
  const currentUserData = userProfileStore?.store?.user?.data || userProfileStore?.data;
  
  // 2. Definice issue
  const issue = getIssueById(issueId);

  // --- 3. BUDGET LOGIKA (S FORMÁTOVÁNÍM A OPRÁVNĚNÍM) ---
  const [displayValue, setDisplayValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Kontrola oprávnění
  const currentUserId = currentUserData?.id;
  const currentUserEmail = currentUserData?.email?.toLowerCase();

  const isAllowed = ALLOWED_USERS.some(allowed => {
      const allowedLower = allowed.toLowerCase();
      return allowedLower === currentUserId || allowedLower === currentUserEmail;
  });

  const showBudget = Boolean(isAllowed);

  // Kontrola oprávnění pro Budget Complete
  const isBudgetCompleteAllowed = ALLOWED_BUDGET_COMPLETE_USERS.some(allowed => {
      const allowedLower = allowed.toLowerCase();
      return allowedLower === currentUserId || allowedLower === currentUserEmail;
  });

  const showBudgetComplete = Boolean(isBudgetCompleteAllowed);

  // --- 4. CONTACT PERSON LOGIKA (SAFE MODE) ---
  const [contactPerson, setContactPerson] = useState(issue?.contact_person ?? "");
  const [isContactEditing, setIsContactEditing] = useState(false);

  // Pro jistotu to zatím povolíme všem, abychom vyloučili chybu v auth logice
  const showContactPerson = true; 

  useEffect(() => {
    if (!isContactEditing) {
      setContactPerson(issue?.contact_person ?? "");
    }
  }, [issue?.contact_person, isContactEditing]);

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



  // Pomocná funkce: 10000 -> "10 000 Kč"
  const formatMoney = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return "";
    return val.toLocaleString("cs-CZ") + " Kč";
  };

  // Synchronizace: Když se načte issue a needitujeme, naformátujeme hodnotu
  useEffect(() => {
    if (!isEditing && issue) {
       setDisplayValue(formatMoney(issue.budget));
    }
  }, [issue?.budget, isEditing]);

  // Handlery
  const handleFocus = () => {
    setIsEditing(true);
    // Zobrazíme čisté číslo pro editaci
    setDisplayValue(issue?.budget?.toString() ?? "");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value);
  };

  const handleBlur = async () => {
    setIsEditing(false);
    
    // Odstraníme vše kromě číslic (mezery, Kč, text)
    const rawValue = displayValue.replace(/[^\d]/g, ''); 
    const numVal = rawValue === "" ? null : Number(rawValue);

    // Pokud je změna oproti DB, uložíme
    if (issue && numVal !== issue.budget && issueOperations) {
        try {
            await issueOperations.update(workspaceSlug, projectId, issueId, { budget: numVal });
            setDisplayValue(formatMoney(numVal));
        } catch (err) {
            console.error("Budget save failed", err);
            setDisplayValue(formatMoney(issue.budget)); // Revert při chybě
        }
    } else {
        // Jen přeformátujeme zpět
        setDisplayValue(formatMoney(numVal));
    }
  };
  // ------------------------------------------

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

    if (issue && numVal !== issue.budget_complete && issueOperations) {
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
  // ------------------------------------------

  // 4. Guard
  if (!issue) return <></>;

  const createdByDetails = getUserDetails(issue.created_by);
  const projectDetails = getProjectById(issue.project_id);
  const stateDetails = getStateById(issue.state_id);

  const minDate = issue.start_date ? getDate(issue.start_date) : null;
  minDate?.setDate(minDate.getDate());

  const maxDate = issue.target_date ? getDate(issue.target_date) : null;
  maxDate?.setDate(maxDate.getDate());

  // --- 5. DEALER (OBCHODNÍK) LOGIKA ---
  const showDealer = true;

  // Oprávnění pro "Zaplaceno obchodníkovi" - pouze vybraní uživatelé
  const ALLOWED_DEALER_PAID_USERS = [
    "david.matousu@gmail.com",
    "adam.bosak@onixia.cz",
  ];
  const showDealerPaid = ALLOWED_DEALER_PAID_USERS.some(
    (email) => email.toLowerCase() === currentUserEmail
  );

  // "Závazně objednáno" - viditelné pro všechny
  const showFirmlyOrdered = true;

  const handleDealerChange = async (val: string) => {
    if (val === (issue?.dealer ?? "")) return;
    try {
      await issueOperations.update(workspaceSlug, projectId, issueId, {
        dealer: val,
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
      <div className="flex items-center h-full w-full flex-col divide-y-2 divide-subtle-1 overflow-hidden">
        <div className="h-full w-full overflow-y-auto px-6">
          <h5 className="mt-5 text-body-xs-medium">{t("common.properties")}</h5>
          <div className={`mb-2 mt-4 space-y-2.5 truncate ${!isEditable ? "opacity-60" : ""}`}>
           {/* --- KONTAKTNÍ OSOBA (OPRAVENO) --- */}
            {showContactPerson && (
              <SidebarPropertyListItem 
                // ZMĚNA ZDE: Nepoužívej <... />, předej jen název komponenty!
                icon={UserCirclePropertyIcon} 
                label="Contact Person"
              >
                <div className="group flex w-full items-center gap-2">
                  <input
                    type="text"
                    className="w-full bg-transparent text-sm text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none"
                    placeholder="Add name..."
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    onFocus={() => setIsContactEditing(true)}
                    onBlur={submitContactPerson}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    disabled={!isEditable} 
                  />
                  {!isContactEditing && !contactPerson && (
                    <span className="hidden text-custom-text-400 group-hover:block">
                      ✎
                    </span>
                  )}
                </div>
              </SidebarPropertyListItem>
            )}

            {/* --- DEALER / OBCHODNÍK (DROPDOWN) --- */}
            {showDealer && (
              <SidebarPropertyListItem 
                icon={DealerPropertyIcon} 
                label="Obchodník"
              >
                <DealerDropdown
                  value={issue?.dealer ?? ""}
                  onChange={handleDealerChange}
                  disabled={!isEditable}
                />
              </SidebarPropertyListItem>
            )} 

            {/* --- DEALER PAID / ZAPLACENO OBCHODNÍKOVI --- */}
            {showDealerPaid && (
              <SidebarPropertyListItem 
                icon={DealerPropertyIcon} 
                label="Zaplaceno obch."
              >
                <div className="flex items-center w-full h-7.5 px-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-body-xs-regular">
                    <input
                      type="checkbox"
                      checked={!!issue?.dealer_paid}
                      onChange={async (e) => {
                        try {
                          await issueOperations.update(workspaceSlug, projectId, issueId, {
                            dealer_paid: e.target.checked,
                          });
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      disabled={!isEditable}
                      className="h-4 w-4 rounded border-custom-border-300 text-custom-primary-100 focus:ring-custom-primary-100 cursor-pointer"
                    />
                    <span className={issue?.dealer_paid ? "text-green-500" : "text-custom-text-400"}>
                      {issue?.dealer_paid ? "Ano" : "Ne"}
                    </span>
                  </label>
                </div>
              </SidebarPropertyListItem>
            )}

            {/* --- FIRMLY ORDERED / ZÁVAZNĚ OBJEDNÁNO --- */}
            {showFirmlyOrdered && (
              <SidebarPropertyListItem
                icon={FirmlyOrderedPropertyIcon}
                label="Závazně obj."
              >
                <div className="flex items-center w-full h-7.5 px-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-body-xs-regular">
                    <input
                      type="checkbox"
                      checked={!!issue?.firmly_ordered}
                      onChange={async (e) => {
                        try {
                          await issueOperations.update(workspaceSlug, projectId, issueId, {
                            firmly_ordered: e.target.checked,
                          });
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      disabled={!isEditable}
                      className="h-4 w-4 rounded border-custom-border-300 text-custom-primary-100 focus:ring-custom-primary-100 cursor-pointer"
                    />
                    <span className={issue?.firmly_ordered ? "text-green-500" : "text-custom-text-400"}>
                      {issue?.firmly_ordered ? "Ano" : "Ne"}
                    </span>
                  </label>
                </div>
              </SidebarPropertyListItem>
            )}

            <SidebarPropertyListItem icon={StatePropertyIcon} label={t("common.state")}>
              <StateDropdown
                value={issue?.state_id}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
                projectId={projectId?.toString() ?? ""}
                disabled={!isEditable}
                buttonVariant="transparent-with-text"
                className="group w-full grow"
                buttonContainerClassName="w-full text-left h-7.5"
                buttonClassName="text-body-xs-regular"
                dropdownArrow
                dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
              />
            </SidebarPropertyListItem>

            <SidebarPropertyListItem icon={MembersPropertyIcon} label={t("common.assignees")}>
              <MemberDropdown
                value={issue?.assignee_ids ?? undefined}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
                disabled={!isEditable}
                projectId={projectId?.toString() ?? ""}
                placeholder={t("issue.add.assignee")}
                multiple
                buttonVariant={issue?.assignee_ids?.length > 1 ? "transparent-without-text" : "transparent-with-text"}
                className="group w-full grow"
                buttonContainerClassName="w-full text-left h-7.5"
                buttonClassName={`text-body-xs-regular justify-between ${issue?.assignee_ids?.length > 0 ? "" : "text-placeholder"}`}
                hideIcon={issue.assignee_ids?.length === 0}
                dropdownArrow
                dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
              />
            </SidebarPropertyListItem>

            <SidebarPropertyListItem icon={PriorityPropertyIcon} label={t("common.priority")}>
              <PriorityDropdown
                value={issue?.priority}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
                disabled={!isEditable}
                buttonVariant="transparent-with-text"
                className="w-full h-7.5 grow rounded-sm"
                buttonContainerClassName="size-full text-left"
                buttonClassName="size-full px-2 py-0.5 whitespace-nowrap [&_svg]:size-3.5"
              />
            </SidebarPropertyListItem>

            {createdByDetails && (
              <SidebarPropertyListItem icon={UserCirclePropertyIcon} label={t("common.created_by")}>
                <div className="px-2 flex gap-2">
                  <ButtonAvatars showTooltip userIds={createdByDetails.id} />
                  <span className="grow truncate text-body-xs-regular leading-5">{createdByDetails?.display_name}</span>
                </div>
              </SidebarPropertyListItem>
            )}

            <SidebarPropertyListItem icon={StartDatePropertyIcon} label={t("common.order_by.start_date")}>
              <DateDropdown
                placeholder={t("issue.add.start_date")}
                value={issue.start_date}
                onChange={(val) =>
                  issueOperations.update(workspaceSlug, projectId, issueId, {
                    start_date: val ? renderFormattedPayloadDate(val) : null,
                  })
                }
                maxDate={maxDate ?? undefined}
                disabled={!isEditable}
                buttonVariant="transparent-with-text"
                className="group w-full grow"
                buttonContainerClassName="w-full text-left h-7.5"
                buttonClassName={`text-body-xs-regular ${issue?.start_date ? "" : "text-placeholder"}`}
                hideIcon
                clearIconClassName="h-3 w-3 hidden group-hover:inline"
              />
            </SidebarPropertyListItem>

            <SidebarPropertyListItem icon={DueDatePropertyIcon} label={t("common.order_by.due_date")}>
              <div className="flex items-center gap-2 w-full">
                <DateDropdown
                  placeholder={t("issue.add.due_date")}
                  value={issue.target_date}
                  onChange={(val) =>
                    issueOperations.update(workspaceSlug, projectId, issueId, {
                      target_date: val ? renderFormattedPayloadDate(val) : null,
                    })
                  }
                  minDate={minDate ?? undefined}
                  disabled={!isEditable}
                  buttonVariant="transparent-with-text"
                  className="group w-full grow"
                  buttonContainerClassName="w-full text-left h-7.5"
                  buttonClassName={cn("text-body-xs-regular", {
                    "text-placeholder": !issue.target_date,
                    "text-danger-primary": shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group),
                  })}
                  hideIcon
                  clearIconClassName="h-3 w-3 hidden group-hover:inline text-primary"
                />
                {issue.target_date && <DateAlert date={issue.target_date} workItem={issue} projectId={projectId} />}
              </div>
            </SidebarPropertyListItem>

            {projectId && areEstimateEnabledByProjectId(projectId) && (
              <SidebarPropertyListItem icon={EstimatePropertyIcon} label={t("common.estimate")}>
                <EstimateDropdown
                  value={issue?.estimate_point ?? undefined}
                  onChange={(val: string | undefined) =>
                    issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })
                  }
                  projectId={projectId}
                  disabled={!isEditable}
                  buttonVariant="transparent-with-text"
                  className="group w-full grow"
                  buttonContainerClassName="w-full text-left h-7.5"
                  buttonClassName={`text-body-xs-regular ${issue?.estimate_point !== null ? "" : "text-placeholder"}`}
                  placeholder={t("common.none")}
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
                  disabled={!isEditable}
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
                  disabled={!isEditable}
                />
              </SidebarPropertyListItem>
            )}

            <SidebarPropertyListItem icon={ParentPropertyIcon} label={t("common.parent")}>
              <IssueParentSelectRoot
                className="w-full h-7.5 grow"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                disabled={!isEditable}
              />
            </SidebarPropertyListItem>

            <SidebarPropertyListItem icon={LabelPropertyIcon} label={t("common.labels")}>
              <IssueLabel
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                disabled={!isEditable}
              />
            </SidebarPropertyListItem>

            {/* --- BUDGET INPUT (SIDEBAR - FORMATTED & SECURED) --- */}
            {showBudget && (
              <SidebarPropertyListItem icon={BudgetPropertyIcon} label="Rozpočet">
                <div className="flex items-center w-full h-7.5 group">
                  <input
                    type="text" // ZMĚNA NA TEXT PRO FORMÁTOVÁNÍ
                    className="w-full bg-transparent text-left text-body-xs-regular text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none rounded px-1.5 py-0.5 transition-all"
                    placeholder="-"
                    value={displayValue}
                    onFocus={handleFocus}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    disabled={!isEditable}
                  />
                  {/* Ikona tužky pro efekt */}
                  {!isEditing && !displayValue && isEditable && (
                    <span className="hidden group-hover:inline text-custom-text-400 ml-auto pr-2">✎</span>
                  )}
                </div>
              </SidebarPropertyListItem>
            )}

            {/* --- BUDGET COMPLETE (Vyčerpáno) --- */}
            {showBudgetComplete && (
              <SidebarPropertyListItem icon={BudgetPropertyIcon} label="Náklady celkem">
                <div className="flex items-center w-full h-7.5 group">
                  <input
                    type="text"
                    className="w-full bg-transparent text-left text-body-xs-regular text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none rounded px-1.5 py-0.5 transition-all"
                    placeholder="-"
                    value={displayValueComplete}
                    onFocus={handleFocusComplete}
                    onChange={handleChangeComplete}
                    onBlur={handleBlurComplete}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    disabled={!isEditable}
                  />
                  {!isEditingComplete && !displayValueComplete && isEditable && (
                    <span className="hidden group-hover:inline text-custom-text-400 ml-auto pr-2">✎</span>
                  )}
                </div>
              </SidebarPropertyListItem>
            )}
            {/* ----------------------------- */}

            <IssueWorklogProperty
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              disabled={!isEditable}
            />

            <WorkItemAdditionalSidebarProperties
              workItemId={issue.id}
              workItemTypeId={issue.type_id}
              projectId={projectId}
              workspaceSlug={workspaceSlug}
              isEditable={isEditable}
            />
          </div>
        </div>
      </div>
    </>
  );
});