import { useState, useRef, useEffect, forwardRef } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "../lib/utils/cn";

export const Combobox = forwardRef(function Combobox(
  {
    className = "",
    label,
    options = [], // [{ value, label, description }]
    value,
    onChange,
    placeholder = "Select or search...",
    searchPlaceholder = "Search options...",
    error,
    helperText,
    disabled = false,
    required = false,
  },
  ref
) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = options.filter((opt) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const lbl = (opt.label || opt.value || "").toLowerCase();
    const desc = (opt.description || "").toLowerCase();
    return lbl.includes(term) || desc.includes(term);
  });

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = filteredOptions[highlightedIndex];
      if (chosen) {
        onChange?.(chosen.value);
        setIsOpen(false);
        setSearch("");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setSearch("");
    }
  };

  return (
    <div ref={containerRef} className={cn("w-full space-y-1.5 text-left relative", className)}>
      {label && (
        <label className="block text-xs font-medium text-[var(--platform-text-secondary)] select-none">
          {label} {required && <span className="text-[var(--platform-danger)]">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div
        tabIndex={disabled ? -1 : 0}
        ref={ref}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full h-[var(--platform-input-h)] px-3 text-xs rounded-[var(--platform-radius-md)] flex items-center justify-between cursor-pointer select-none",
          "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] border border-[var(--platform-border-strong)] transition-all",
          "hover:border-[var(--platform-text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--platform-accent)]/20 focus-visible:border-[var(--platform-accent)]",
          disabled && "opacity-50 cursor-not-allowed bg-[var(--platform-surface-subtle)]",
          error && "border-[var(--platform-danger)]"
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-[var(--platform-text-muted)]")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-[var(--platform-text-muted)] shrink-0 ml-2" />
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded-[var(--platform-radius-lg)] bg-[var(--platform-surface-raised)] border border-[var(--platform-border)] p-1.5 overflow-hidden animate-in fade-in duration-150"
          style={{ boxShadow: "var(--platform-shadow-popover)" }}
        >
          {/* Search box */}
          <div className="px-1 pb-1.5 border-b border-[var(--platform-border-subtle)]">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="w-full h-7 px-2 text-xs rounded-[var(--platform-radius-sm)] bg-[var(--platform-surface-subtle)] text-[var(--platform-text-primary)] outline-none border border-transparent focus:border-[var(--platform-accent)]"
            />
          </div>

          {/* Options list */}
          <div role="listbox" className="max-h-52 overflow-y-auto pt-1 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-[var(--platform-text-muted)]">
                No matching options.
              </div>
            ) : (
              filteredOptions.map((opt, index) => {
                const isSelected = opt.value === value;
                const isHighlighted = index === highlightedIndex;

                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange?.(opt.value);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      "flex items-center justify-between px-2.5 py-1.5 text-xs rounded-[var(--platform-radius-sm)] cursor-pointer select-none transition-colors",
                      isHighlighted
                        ? "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-primary)]"
                        : "text-[var(--platform-text-secondary)]",
                      isSelected && "font-semibold text-[var(--platform-accent)]"
                    )}
                  >
                    <div className="truncate">
                      <div>{opt.label}</div>
                      {opt.description && (
                        <div className="text-[10px] text-[var(--platform-text-muted)] truncate">
                          {opt.description}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[var(--platform-accent)] shrink-0 ml-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {error ? (
        <p className="text-[11px] text-[var(--platform-danger)] font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-[11px] text-[var(--platform-text-muted)]">{helperText}</p>
      ) : null}
    </div>
  );
});
