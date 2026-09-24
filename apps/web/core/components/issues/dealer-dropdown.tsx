import { observer } from "mobx-react";
import { DEALER_OPTIONS, parseDealers, joinDealers } from "./dealer-config";
import { PersonMultiSelectDropdown } from "./person-multi-select-dropdown";

interface DealerDropdownProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const DealerDropdown = observer(function DealerDropdown(props: DealerDropdownProps) {
  const { placeholder = "Vybrat obchodníky...", ...rest } = props;
  return (
    <PersonMultiSelectDropdown
      {...rest}
      placeholder={placeholder}
      options={DEALER_OPTIONS}
      parse={parseDealers}
      join={joinDealers}
    />
  );
});
