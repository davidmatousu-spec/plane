import { useState, useRef, useEffect } from "react";
import { observer } from "mobx-react";
import { cn } from "@plane/utils";
import { DEALER_OPTIONS, normalizeDealer } from "./dealer-config";

interface DealerDropdownProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const DealerDropdown = observer(function DealerDropdown(props: DealerDropdownProps) {
  const { value, onChange, disabled = false, placeholder = "Vybrat obchodníka...", className } = props;

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Normalize value on first render (auto-fix partial names)
  useEffect(() => {
    if (value) {
      const normalized = normalizeDealer(value);
      if (normalized !== value) {
        onChange(normalized);
      }
    }
  }, []); // Only on mount

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

  const handleSelect = (dealerValue: string) => {
    onChange(dealerValue);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  // Display label
  const displayLabel = value || "";
  const isKnownDealer = DEALER_OPTIONS.some((o) => o.value === value);

  return (
    <div ref={dropdownRef} className={cn("relative w-full", className)}>
      {/* Trigger button */}
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-1 rounded px-1.5 py-0.5 text-left text-sm transition-all",
          "bg-transparent hover:bg-custom-background-80/50",
          "text-custom-text-100 placeholder:text-custom-text-400",
          "focus:outline-none",
          disabled && "cursor-not-allowed opacity-60"
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={cn("truncate", !displayLabel && "text-custom-text-400")}>
          {displayLabel || placeholder}
        </span>
        <span className="flex items-center gap-0.5 shrink-0">
          {value && !disabled && (
            <span
              className="text-custom-text-400 hover:text-custom-text-200 cursor-pointer text-xs"
              onClick={handleClear}
              title="Vymazat"
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
          {DEALER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                "hover:bg-custom-background-80 transition-colors",
                value === option.value
                  ? "text-custom-text-100 font-medium"
                  : "text-custom-text-200"
              )}
              onClick={() => handleSelect(option.value)}
            >
              {value === option.value && (
                <svg className="h-3 w-3 shrink-0 text-custom-primary-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {value !== option.value && <span className="w-3 shrink-0" />}
              <span>{option.label}</span>
            </button>
          ))}

          {/* Show current value if it's not in the list (legacy data) */}
          {value && !isKnownDealer && (
            <>
              <div className="border-t border-custom-border-200 my-1" />
              <div className="px-3 py-1.5 text-xs text-custom-text-400">
                Aktuální: <span className="text-custom-text-200">{value}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
