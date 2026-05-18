import { useState, useRef, useEffect } from "react";
import { observer } from "mobx-react";
import { cn } from "@plane/utils";
import { DEALER_OPTIONS, parseDealers, joinDealers } from "./dealer-config";

interface DealerDropdownProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const DealerDropdown = observer(function DealerDropdown(props: DealerDropdownProps) {
  const { value, onChange, disabled = false, placeholder = "Vybrat obchodníky...", className } = props;

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse current value into array
  const selectedDealers = parseDealers(value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleToggle = (dealerValue: string) => {
    const isSelected = selectedDealers.includes(dealerValue);
    let newDealers: string[];

    if (isSelected) {
      // Remove
      newDealers = selectedDealers.filter((d) => d !== dealerValue);
    } else {
      // Add
      newDealers = [...selectedDealers, dealerValue];
    }

    onChange(joinDealers(newDealers));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  const handleRemoveOne = (e: React.MouseEvent, dealerValue: string) => {
    e.stopPropagation();
    const newDealers = selectedDealers.filter((d) => d !== dealerValue);
    onChange(joinDealers(newDealers));
  };

  return (
    <div ref={dropdownRef} className={cn("relative w-full", className)}>
      {/* Trigger button */}
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-1 rounded px-1.5 py-0.5 text-left text-sm transition-all min-h-[28px]",
          "bg-transparent hover:bg-custom-background-80/50",
          "text-custom-text-100 placeholder:text-custom-text-400",
          "focus:outline-none",
          disabled && "cursor-not-allowed opacity-60"
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
          {selectedDealers.length === 0 && (
            <span className="text-custom-text-400">{placeholder}</span>
          )}
          {selectedDealers.map((dealer) => (
            <span
              key={dealer}
              className="inline-flex items-center gap-0.5 rounded-full bg-custom-background-80 px-2 py-0.5 text-xs font-medium text-custom-text-200"
            >
              <span className="truncate max-w-[100px]">{dealer.split(" ")[0]}</span>
              {!disabled && (
                <span
                  className="text-custom-text-400 hover:text-custom-text-100 cursor-pointer ml-0.5"
                  onClick={(e) => handleRemoveOne(e, dealer)}
                  title="Odebrat"
                >
                  ✕
                </span>
              )}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-0.5 shrink-0">
          {selectedDealers.length > 0 && !disabled && (
            <span
              className="text-custom-text-400 hover:text-custom-text-200 cursor-pointer text-xs"
              onClick={handleClear}
              title="Vymazat vše"
            >
              ✕
            </span>
          )}
          <svg
            className={cn("h-3 w-3 text-custom-text-400 transition-transform", isOpen && "rotate-180")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute left-0 top-full z-50 mt-1 w-full min-w-[180px]",
            "rounded-md border border-custom-border-300",
            "shadow-xl py-1"
          )}
          style={{ backgroundColor: "var(--background-color-layer-2, #1f2228)" }}
        >
          {DEALER_OPTIONS.map((option) => {
            const isSelected = selectedDealers.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                  "hover:bg-custom-background-80 transition-colors",
                  isSelected
                    ? "text-custom-text-100 font-medium"
                    : "text-custom-text-200"
                )}
                onClick={() => handleToggle(option.value)}
              >
                {/* Checkbox */}
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors",
                    isSelected
                      ? "border-custom-primary-100 bg-custom-primary-100"
                      : "border-custom-border-300"
                  )}
                >
                  {isSelected && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
