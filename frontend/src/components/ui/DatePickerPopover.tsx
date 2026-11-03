// ─────────────────────────────────────────────────────────────
//  components/ui/DatePickerPopover.tsx
//  Clean custom calendar & time picker (no native browser popups)
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";

interface DatePickerPopoverProps {
  value: string; // ISO string or empty
  onChange: (isoString: string) => void;
  placeholder?: string;
}

export function DatePickerPopover({
  value,
  onChange,
  placeholder = "Pick date & time",
}: DatePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initial selected date or tomorrow 9:00 AM
  const initialDate = value ? new Date(value) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  })();

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(initialDate.getDate());
  const [selectedHour, setSelectedHour] = useState(initialDate.getHours() % 12 || 12);
  const [selectedMinute, setSelectedMinute] = useState(initialDate.getMinutes() < 30 ? "00" : "30");
  const [selectedPeriod, setSelectedPeriod] = useState<"AM" | "PM">(
    initialDate.getHours() >= 12 ? "PM" : "AM"
  );

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Days in month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun

  const applyDateTime = (day: number, hour: number, minute: string, period: "AM" | "PM") => {
    let militaryHour = hour % 12;
    if (period === "PM") militaryHour += 12;
    const d = new Date(viewYear, viewMonth, day, militaryHour, parseInt(minute, 10), 0);
    onChange(d.toISOString());
  };

  const handleDaySelect = (d: number) => {
    setSelectedDay(d);
    applyDateTime(d, selectedHour, selectedMinute, selectedPeriod);
  };

  const handleHourSelect = (h: number) => {
    setSelectedHour(h);
    applyDateTime(selectedDay, h, selectedMinute, selectedPeriod);
  };

  const handleMinuteSelect = (m: string) => {
    setSelectedMinute(m);
    applyDateTime(selectedDay, selectedHour, m, selectedPeriod);
  };

  const handlePeriodSelect = (p: "AM" | "PM") => {
    setSelectedPeriod(p);
    applyDateTime(selectedDay, selectedHour, selectedMinute, p);
  };

  // Formatted display text
  const displayString = value ? (() => {
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return "";
      const monthStr = monthNames[d.getMonth()]?.slice(0, 3);
      const day = d.getDate();
      const yr = d.getFullYear();
      let hr = d.getHours();
      const ampm = hr >= 12 ? "PM" : "AM";
      hr = hr % 12 || 12;
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${monthStr} ${day}, ${yr} ${hr}:${min} ${ampm}`;
    } catch {
      return "";
    }
  })() : "";

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger: Underline style with text and calendar icon */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full pb-[8px] border-b border-[#E5E7EB] flex items-center justify-between cursor-pointer hover:border-[#00A63E] transition-colors"
      >
        <span
          className={`text-[14px] ${
            displayString ? "text-[#101828] font-[500]" : "text-[#848484]"
          }`}
        >
          {displayString || placeholder}
        </span>
        <CalendarIcon className="w-[18px] h-[18px] text-[#99A1AF] stroke-[1.5]" />
      </div>

      {/* Custom Floating Calendar & Time Dropdown */}
      {isOpen && (
        <div
          className="absolute top-[36px] left-[-16px] w-[310px] bg-white rounded-[10px] border border-[#E5E7EB] shadow-2xl p-[14px] z-50 animate-in fade-in zoom-in-95 duration-100"
          style={{ boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)" }}
        >
          {/* Month / Year header */}
          <div className="flex items-center justify-between mb-[10px]">
            <span className="text-[14px] font-[600] text-[#101828]">
              {monthNames[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center gap-[4px]">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="w-[26px] h-[26px] rounded-full flex items-center justify-center hover:bg-[#F4F7F5] text-[#4A5565]"
              >
                <ChevronLeft className="w-[16px] h-[16px]" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="w-[26px] h-[26px] rounded-full flex items-center justify-center hover:bg-[#F4F7F5] text-[#4A5565]"
              >
                <ChevronRight className="w-[16px] h-[16px]" />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center text-[11px] font-[500] text-[#99A1AF] mb-[4px]">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-y-[2px] text-center text-[12px] mb-[12px]">
            {/* Empty slots before first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="w-[34px] h-[28px]" />
            ))}

            {/* Days in month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected = day === selectedDay;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDaySelect(day)}
                  className={`w-[34px] h-[28px] mx-auto rounded-[6px] flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-[#00A63E] text-white font-[600]"
                      : "text-[#1E2939] hover:bg-[#E5F6EC] hover:text-[#00A63E]"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time Selector */}
          <div className="pt-[10px] border-t border-[#F1F2F4] flex items-center justify-between">
            <div className="flex items-center gap-[4px] text-[12px] text-[#4A5565]">
              <Clock className="w-[14px] h-[14px] text-[#99A1AF]" />
              <span>Time:</span>
            </div>

            <div className="flex items-center gap-[4px]">
              {/* Hour */}
              <select
                value={selectedHour}
                onChange={(e) => handleHourSelect(parseInt(e.target.value, 10))}
                className="h-[28px] px-[4px] bg-[#F4F7F5] border border-[#E5E7EB] rounded-[4px] text-[12px] font-[500] text-[#101828] outline-none"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {String(i + 1).padStart(2, "0")}
                  </option>
                ))}
              </select>

              <span>:</span>

              {/* Minute */}
              <select
                value={selectedMinute}
                onChange={(e) => handleMinuteSelect(e.target.value)}
                className="h-[28px] px-[4px] bg-[#F4F7F5] border border-[#E5E7EB] rounded-[4px] text-[12px] font-[500] text-[#101828] outline-none"
              >
                <option value="00">00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
              </select>

              {/* AM/PM */}
              <div className="flex rounded-[4px] border border-[#E5E7EB] overflow-hidden ml-[4px]">
                <button
                  type="button"
                  onClick={() => handlePeriodSelect("AM")}
                  className={`px-[6px] h-[26px] text-[11px] font-[600] transition-colors ${
                    selectedPeriod === "AM"
                      ? "bg-[#00A63E] text-white"
                      : "bg-[#F4F7F5] text-[#6A7282] hover:bg-[#E5F6EC]"
                  }`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodSelect("PM")}
                  className={`px-[6px] h-[26px] text-[11px] font-[600] transition-colors ${
                    selectedPeriod === "PM"
                      ? "bg-[#00A63E] text-white"
                      : "bg-[#F4F7F5] text-[#6A7282] hover:bg-[#E5F6EC]"
                  }`}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* Done closing button */}
          <div className="mt-[10px] pt-[8px] flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[12px] font-[600] text-[#00A63E] hover:underline"
            >
              Confirm Date & Time
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

