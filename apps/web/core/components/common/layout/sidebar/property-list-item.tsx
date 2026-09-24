import type { ReactNode } from "react";
import { cn } from "@plane/utils";

type TSidebarPropertyListItemProps = {
  icon: React.FC<{ className?: string }>;
  label: string;
  children: ReactNode;
  appendElement?: ReactNode;
  childrenClassName?: string;
};

export function SidebarPropertyListItem(props: TSidebarPropertyListItemProps) {
  const { icon: Icon, label, children, appendElement, childrenClassName } = props;

  return (
    <div className="flex items-start gap-2">
      {/* min-h místo h: dlouhý popisek se zalomí na 2 řádky a řádek se podle něj zvětší */}
      <div className="flex shrink-0 items-center gap-1.5 w-30 text-body-xs-regular text-tertiary min-h-7.5">
        <Icon className="size-4 shrink-0" />
        {/* whitespace-normal: seznam v sidebaru má "truncate" (white-space: nowrap), který
            se dědí - dlouhé popisky (Doprava + ubytování…) by jinak přetekly pod hodnotu */}
        <span className="whitespace-normal">{label}</span>
        {appendElement}
      </div>
      <div className={cn("grow flex items-center flex-wrap gap-1", childrenClassName)}>{children}</div>
    </div>
  );
}
