"use client";

import { useState, useMemo } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface WatchedDateCalendarProps {
  value: string;
  onChange: (date: string) => void;
  onChoose: () => void;
  onCancel: () => void;
  onClear: () => void;
  isPending: boolean;
  initialView: { year: number; month: number };
}

export function WatchedDateCalendar({
  value,
  onChange,
  onChoose,
  onCancel,
  onClear,
  isPending,
  initialView,
}: WatchedDateCalendarProps) {
  const [view, setView] = useState(initialView);
  const [hovered, setHovered] = useState<string | null>(null);

  const gridDays = useMemo(() => {
    const { year, month } = view;
    const first = new Date(year, month - 1, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const startDate = new Date(first);
    startDate.setDate(startDate.getDate() - mondayOffset);

    const days: { date: Date; isCurrentMonth: boolean; key: string }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate.getTime());
      d.setDate(d.getDate() + i);
      days.push({
        date: d,
        isCurrentMonth: d.getMonth() === month - 1,
        key: toDateKey(d),
      });
    }
    return days;
  }, [view]);

  return (
    <div className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-[#2A2440] bg-[#1C1830] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
      {/* header: month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setView((v) =>
              v.month === 1
                ? { year: v.year - 1, month: 12 }
                : { year: v.year, month: v.month - 1 }
            )
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#E8E0F0] transition-colors hover:bg-[#28223E]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-base font-medium text-[#E8E0F0]">
          {MONTHS[view.month - 1]} {view.year}
        </span>
        <button
          type="button"
          onClick={() =>
            setView((v) =>
              v.month === 12
                ? { year: v.year + 1, month: 1 }
                : { year: v.year, month: v.month + 1 }
            )
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#E8E0F0] transition-colors hover:bg-[#28223E]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* day labels */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {DAYS.map((d) => (
          <div
            key={d}
            className="flex items-center justify-center py-1 text-xs font-medium text-[#8B7FA0]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* date grid */}
      <div className="grid grid-cols-7 gap-1">
        {gridDays.map(({ date, isCurrentMonth, key }) => {
          const isSelected = key === value;
          const isHovered = key === hovered;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors ${
                isSelected
                  ? "bg-[#E064D6] text-white"
                  : isHovered && isCurrentMonth
                    ? "border border-[#E064D6] bg-[#28223E] text-[#E8E0F0]"
                    : isCurrentMonth
                      ? "bg-[#28223E] text-[#E8E0F0] hover:border hover:border-[#E064D6]/50"
                      : "bg-transparent text-[#6B6080]"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      {/* action buttons */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg bg-[#28223E] px-4 py-2.5 text-sm font-medium text-[#E8E0F0] transition-colors hover:bg-[#36285A]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onChoose}
          disabled={!value || isPending}
          className="flex-1 rounded-lg bg-[#E064D6] px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_14px_rgba(224,100,214,0.35)] transition-all hover:bg-[#C850C0] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Choose Date
        </button>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 w-full text-center text-xs text-[#8B7FA0] transition-colors hover:text-[#E06B7A]"
      >
        Clear watched date
      </button>
    </div>
  );
}
