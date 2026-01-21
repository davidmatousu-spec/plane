import { observer } from "mobx-react";
import { Users } from "lucide-react"; // Použijeme ikonku Users
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent, IssueLink } from "./";

type TIssueContactPersonActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

export const IssueContactPersonActivity = observer(function IssueContactPersonActivity(props: TIssueContactPersonActivity) {
  const { activityId, showIssue = true, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  return (
    <IssueActivityBlockComponent
      icon={<Users size={14} className="text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {activity.new_value ? (
          <>
            set the Contact Person to{" "}
            <span className="font-medium text-custom-text-100">{activity.new_value}</span>
          </>
        ) : (
          <>removed the Contact Person</>
        )}
        {showIssue ? ` of ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});