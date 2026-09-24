import { observer } from "mobx-react";
import { SCANNER_OPTIONS, parseScanners, joinScanners } from "./scanner-config";
import { PersonMultiSelectDropdown } from "./person-multi-select-dropdown";

interface ScannerDropdownProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const ScannerDropdown = observer(function ScannerDropdown(props: ScannerDropdownProps) {
  const { placeholder = "Vybrat skenovače...", ...rest } = props;
  return (
    <PersonMultiSelectDropdown
      {...rest}
      placeholder={placeholder}
      options={SCANNER_OPTIONS}
      parse={parseScanners}
      join={joinScanners}
    />
  );
});
