import { observer } from "mobx-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent, IssueLink } from "./";

type TIssueDealerActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

// Ikonka obchodu (stejná jako v Sidebaru)
const DealerIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 21l18 0" />
    <path d="M5 21v-7l8 -4l8 4v7" />
    <path d="M19 10l0 -4.05c0 -.526 -.403 -.968 -.923 -1.03l-5.184 -.617a2.997 2.997 0 0 0 -3.766 1.636l-.127 .361" />
  </svg>
);

export const IssueDealerActivity = observer(function IssueDealerActivity(props: TIssueDealerActivity) {
  const { activityId, showIssue = true, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  return (
    <IssueActivityBlockComponent
      icon={<DealerIcon className="h-3.5 w-3.5 text-custom-text-200" />} // Upravená velikost a barva
      activityId={activityId}
      ends={ends}
    >
      <>
        {activity.new_value ? (
          <>
            set the Dealer to{" "}
            <span className="font-medium text-custom-text-100">{activity.new_value}</span>
          </>
        ) : (
          <>removed the Dealer</>
        )}
        {showIssue ? ` of ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});