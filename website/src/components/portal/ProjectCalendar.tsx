"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchCalendar, type PortalCalendarData, type PortalCalendarEvent, type PortalCalendarTask } from "@/services/portal";

function formatTime(time: string) {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: PortalCalendarTask[];
  events: PortalCalendarEvent[];
}

export default function ProjectCalendar({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const [data, setData] = useState<PortalCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const end = new Date(year, month + 1, 0);
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

    fetchCalendar(projectId, start, endStr)
      .then(setData)
      .catch(() => setData({ tasks: [], events: [], phases: [] }))
      .finally(() => setLoading(false));
  }, [projectId, currentMonth, enabled]);

  const days = useMemo<CalendarDay[]>(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const today = new Date();

    const result: CalendarDay[] = [];

    // Previous month padding
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      result.push({ date: d, isCurrentMonth: false, isToday: false, tasks: [], events: [] });
    }

    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isToday = date.toDateString() === today.toDateString();

      const tasks = (data?.tasks || []).filter((t) => {
        return dateStr >= t.start_date && dateStr <= t.end_date;
      });

      const events = (data?.events || []).filter((e) => {
        return dateStr >= e.start_date && dateStr <= e.end_date;
      });

      result.push({ date, isCurrentMonth: true, isToday, tasks, events });
    }

    // Next month padding
    const remaining = 7 - (result.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        result.push({ date: d, isCurrentMonth: false, isToday: false, tasks: [], events: [] });
      }
    }

    return result;
  }, [currentMonth, data]);

  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return days.find((d) => {
      const ds = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, "0")}-${String(d.date.getDate()).padStart(2, "0")}`;
      return ds === selectedDate;
    });
  }, [selectedDate, days]);

  if (!enabled) return null;

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Project Schedule</h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-xs font-medium text-gray-700 w-32 text-center">
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-50 rounded" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              const dateStr = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`;
              const hasItems = day.tasks.length > 0 || day.events.length > 0;
              const isSelected = selectedDate === dateStr;

              return (
                <button
                  key={i}
                  onClick={() => hasItems && day.isCurrentMonth ? setSelectedDate(isSelected ? null : dateStr) : null}
                  className={`relative h-10 rounded-lg text-xs transition-all ${
                    !day.isCurrentMonth
                      ? "text-gray-300"
                      : day.isToday
                      ? "font-bold text-blue-600 bg-blue-50"
                      : isSelected
                      ? "bg-gray-900 text-white"
                      : hasItems
                      ? "text-gray-900 hover:bg-gray-50 cursor-pointer"
                      : "text-gray-600"
                  }`}
                >
                  {day.date.getDate()}
                  {hasItems && day.isCurrentMonth && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {day.tasks.length > 0 && (
                        <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-amber-500"}`} />
                      )}
                      {day.events.length > 0 && (
                        <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`} />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day detail */}
          {selectedDayData && (selectedDayData.tasks.length > 0 || selectedDayData.events.length > 0) && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p className="text-[10px] font-medium text-gray-400 uppercase">
                {selectedDayData.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>

              {selectedDayData.tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.color || "#F59E0B" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{task.title}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{task.status.replace(/_/g, " ")}</p>
                  </div>
                </div>
              ))}

              {selectedDayData.events.map((event) => (
                <div key={event.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    event.type === "visit" ? "bg-green-500" : "bg-blue-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{event.title}</p>
                    <p className="text-[10px] text-gray-400">
                      {event.start_time && formatTime(event.start_time)}
                      {event.start_time && event.end_time && " — "}
                      {event.end_time && formatTime(event.end_time)}
                      {event.phase && ` · ${event.phase}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[10px] text-gray-400">Tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] text-gray-400">Crew Schedule</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[10px] text-gray-400">Service Visits</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
