import { observer } from "mobx-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { ScannerIcon } from "@/components/issues/scanner-icon";
import { IssueActivityBlockComponent, IssueLink } from "./";

type TIssueScannerActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

export const IssueScannerActivity = observer(function IssueScannerActivity(props: TIssueScannerActivity) {
  const { activityId, showIssue = true, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  return (
    <IssueActivityBlockComponent
      icon={<ScannerIcon className="h-3.5 w-3.5 text-custom-text-200" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {activity.new_value ? (
          <>
            set the Skenovač to <span className="font-medium text-custom-text-100">{activity.new_value}</span>
          </>
        ) : (
          <>removed the Skenovač</>
        )}
        {showIssue ? ` of ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
