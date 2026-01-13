import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Student-Athlete Lock-In Planner
 * - Daily planner (classes/lift/practice/match/study/recovery)
 * - Pomodoro/custom timer that logs study minutes by course
 * - Wellness check-in (sleep, soreness, stress, energy)
 * - localStorage persistence
 */

const LS_KEYS = {
  events: "sa_lockin_events_v1",
  courses: "sa_lockin_courses_v1",
  wellness: "sa_lockin_wellness_v1",
  studyLog: "sa_lockin_studylog_v1", // { "YYYY-MM-DD": { "COURSE": minutes } }
};

const EVENT_TYPES = [
  "Class",
  "Lift",
  "Practice",
  "Match",
  "Study",
  "Recovery",
  "Other",
];

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function minutesToHhMm(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function startOfWeekISO(date = new Date()) {
  // Week starts Monday
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return todayISOFromDate(d);
}

function todayISOFromDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return todayISOFromDate(d);
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState(todayISO());

  // Courses for study tracking
  const [courses, setCourses] = useState(() =>
    loadJSON(LS_KEYS.courses, ["BIO 212", "CHE 211", "PSY 233"])
  );
  const [newCourse, setNewCourse] = useState("");

  // Events
  const [events, setEvents] = useState(() =>
    loadJSON(LS_KEYS.events, [])
  );
  // Event: { id, date, type, title, startTime, durationMin, notes }

  // Wellness per date
  const [wellness, setWellness] = useState(() =>
    loadJSON(LS_KEYS.wellness, {})
  );
  // wellness[date] = { sleepHours, soreness, stress, energy, notes }

  // Study log per date
  const [studyLog, setStudyLog] = useState(() =>
    loadJSON(LS_KEYS.studyLog, {})
  );

  // Timer state
  const [timerMode, setTimerMode] = useState("Pomodoro"); // Pomodoro | Custom
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [customMin, setCustomMin] = useState(45);

  const [activeCourse, setActiveCourse] = useState(courses[0] || "General");
  const [phase, setPhase] = useState("idle"); // idle | focus | break
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const tickRef = useRef(null);

  // Draft event form
  const [draft, setDraft] = useState({
    type: "Class",
    title: "",
    startTime: "09:00",
    durationMin: 60,
    notes: "",
  });

  // Draft wellness
  const currentWellness = wellness[selectedDate] || {
    sleepHours: 7,
    soreness: 3,
    stress: 4,
    energy: 6,
    notes: "",
  };

  // Persist
  useEffect(() => saveJSON(LS_KEYS.events, events), [events]);
  useEffect(() => saveJSON(LS_KEYS.courses, courses), [courses]);
  useEffect(() => saveJSON(LS_KEYS.wellness, wellness), [wellness]);
  useEffect(() => saveJSON(LS_KEYS.studyLog, studyLog), [studyLog]);

  // Keep active course valid
  useEffect(() => {
    if (!courses.length) return;
    if (!courses.includes(activeCourse)) setActiveCourse(courses[0]);
  }, [courses]); // eslint-disable-line

  // Timer ticking
  useEffect(() => {
    if (!isRunning) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [isRunning]);

  // Phase completion
  useEffect(() => {
    if (!isRunning) return;
    if (secondsLeft > 0) return;

    // If we hit 0 while running, transition
    if (phase === "focus") {
      // log focus minutes to study log
      const minutesDone =
        timerMode === "Custom" ? customMin : focusMin;

      setStudyLog((prev) => {
        const copy = { ...prev };
        const day = selectedDate;
        if (!copy[day]) copy[day] = {};
        if (!copy[day][activeCourse]) copy[day][activeCourse] = 0;
        copy[day][activeCourse] += minutesDone;
        return copy;
      });

      if (timerMode === "Pomodoro") {
        setPhase("break");
        setSecondsLeft(breakMin * 60);
        setIsRunning(true);
      } else {
        // Custom ends after one session
        setPhase("idle");
        setIsRunning(false);
      }
    } else if (phase === "break") {
      setPhase("focus");
      setSecondsLeft(focusMin * 60);
      setIsRunning(true);
    }
  }, [secondsLeft, isRunning, phase, timerMode, focusMin, breakMin, customMin, activeCourse, selectedDate]);

  const eventsForDay = useMemo(() => {
    const list = events.filter((e) => e.date === selectedDate);
    // sort by startTime
    return list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [events, selectedDate]);

  const totalScheduledMin = useMemo(() => {
    return eventsForDay.reduce((sum, e) => sum + (Number(e.durationMin) || 0), 0);
  }, [eventsForDay]);

  const todayStudyByCourse = useMemo(() => {
    return studyLog[selectedDate] || {};
  }, [studyLog, selectedDate]);

  const todayStudyTotal = useMemo(() => {
    const obj = studyLog[selectedDate] || {};
    return Object.values(obj).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [studyLog, selectedDate]);

  const weekStart = useMemo(() => startOfWeekISO(new Date(selectedDate + "T00:00:00")), [selectedDate]);

  const weeklyStudyTotal = useMemo(() => {
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const day = addDaysISO(weekStart, i);
      const obj = studyLog[day] || {};
      total += Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    return total;
  }, [studyLog, weekStart]);

  function addCourse() {
    const c = newCourse.trim();
    if (!c) return;
    if (courses.includes(c)) {
      setNewCourse("");
      return;
    }
    setCourses((prev) => [...prev, c]);
    setNewCourse("");
  }

  function removeCourse(course) {
    setCourses((prev) => prev.filter((c) => c !== course));
    // also remove from logs
    setStudyLog((prev) => {
      const copy = { ...prev };
      Object.keys(copy).forEach((day) => {
        if (copy[day]?.[course] != null) {
          const dayObj = { ...copy[day] };
          delete dayObj[course];
          copy[day] = dayObj;
        }
      });
      return copy;
    });
  }

  function addEvent() {
    if (!draft.title.trim()) return;
    const evt = {
      id: crypto.randomUUID(),
      date: selectedDate,
      type: draft.type,
      title: draft.title.trim(),
      startTime: draft.startTime,
      durationMin: Number(draft.durationMin) || 0,
      notes: draft.notes.trim(),
    };
    setEvents((prev) => [...prev, evt]);
    setDraft((d) => ({ ...d, title: "", notes: "" }));
  }

  function deleteEvent(id) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function saveWellness(next) {
    setWellness((prev) => ({ ...prev, [selectedDate]: next }));
  }

  function timerLabel() {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function startTimer() {
    if (phase === "idle") {
      if (timerMode === "Custom") {
        setPhase("focus");
        setSecondsLeft(customMin * 60);
      } else {
        setPhase("focus");
        setSecondsLeft(focusMin * 60);
      }
    }
    setIsRunning(true);
  }

  function pauseTimer() {
    setIsRunning(false);
  }

  function resetTimer() {
    setIsRunning(false);
    setPhase("idle");
    setSecondsLeft(0);
  }

  function quickAddTemplate(type) {
    const templates = {
      Class: { title: "Class", durationMin: 75 },
      Lift: { title: "Lift", durationMin: 60 },
      Practice: { title: "Practice", durationMin: 120 },
      Match: { title: "Match", durationMin: 180 },
      Study: { title: "Study Block", durationMin: 60 },
      Recovery: { title: "Recovery (ice/roll/stretch)", durationMin: 30 },
      Other: { title: "Other", durationMin: 30 },
    };
    const t = templates[type] || templates.Other;
    setDraft((d) => ({ ...d, type, title: t.title, durationMin: t.durationMin }));
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.h1}>Lock-In Planner</div>
          <div style={styles.sub}>
            Student-Athlete daily plan • timer • study tracking • wellness
          </div>
        </div>
        <div style={styles.dateWrap}>
          <label style={styles.label}>Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={styles.input}
          />
        </div>
      </div>

      <div style={styles.grid}>
        {/* LEFT: Planner */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Daily Schedule</div>
          <div style={styles.cardMeta}>
            {eventsForDay.length} event(s) • {minutesToHhMm(totalScheduledMin)} scheduled
          </div>

          <div style={styles.rowWrap}>
            <div style={styles.row}>
              <select
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                style={styles.select}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <input
                placeholder="Title (e.g., BIO lecture / Team practice)"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                style={styles.inputWide}
              />
            </div>

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.labelSmall}>Start</label>
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
                  style={styles.input}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.labelSmall}>Duration (min)</label>
                <input
                  type="number"
                  min={0}
                  value={draft.durationMin}
                  onChange={(e) => setDraft((d) => ({ ...d, durationMin: e.target.value }))}
                  style={styles.input}
                />
              </div>
              <button onClick={addEvent} style={styles.primaryBtn}>
                Add
              </button>
            </div>

            <textarea
              placeholder="Notes (travel, coach feedback, assignment due, etc.)"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              style={styles.textarea}
            />

            <div style={styles.quickBar}>
              {EVENT_TYPES.map((t) => (
                <button key={t} onClick={() => quickAddTemplate(t)} style={styles.chip}>
                  + {t}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.divider} />

          {eventsForDay.length === 0 ? (
            <div style={styles.empty}>No events yet. Add your classes, practice, lifts, and study blocks.</div>
          ) : (
            <div style={styles.list}>
              {eventsForDay.map((e) => (
                <div key={e.id} style={styles.listItem}>
                  <div style={styles.listLeft}>
                    <div style={styles.badge}>{e.type}</div>
                    <div>
                      <div style={styles.itemTitle}>
                        {e.startTime} • {e.title}
                      </div>
                      <div style={styles.itemSub}>
                        {minutesToHhMm(Number(e.durationMin) || 0)}
                        {e.notes ? ` • ${e.notes}` : ""}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => deleteEvent(e.id)} style={styles.dangerBtn}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT TOP: Timer + Study */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Lock-In Timer</div>
          <div style={styles.cardMeta}>
            Logs focus time to your selected course
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Mode</label>
            <select
              value={timerMode}
              onChange={(e) => {
                setTimerMode(e.target.value);
                resetTimer();
              }}
              style={styles.select}
            >
              <option value="Pomodoro">Pomodoro</option>
              <option value="Custom">Custom</option>
            </select>

            <label style={{ ...styles.label, marginLeft: 10 }}>Course</label>
            <select
              value={activeCourse}
              onChange={(e) => setActiveCourse(e.target.value)}
              style={styles.select}
            >
              {(courses.length ? courses : ["General"]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {timerMode === "Pomodoro" ? (
            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.labelSmall}>Focus (min)</label>
                <input
                  type="number"
                  min={1}
                  value={focusMin}
                  onChange={(e) => setFocusMin(Number(e.target.value) || 25)}
                  style={styles.input}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.labelSmall}>Break (min)</label>
                <input
                  type="number"
                  min={1}
                  value={breakMin}
                  onChange={(e) => setBreakMin(Number(e.target.value) || 5)}
                  style={styles.input}
                />
              </div>
            </div>
          ) : (
            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.labelSmall}>Session length (min)</label>
                <input
                  type="number"
                  min={1}
                  value={customMin}
                  onChange={(e) => setCustomMin(Number(e.target.value) || 45)}
                  style={styles.input}
                />
              </div>
            </div>
          )}

          <div style={styles.timerBox}>
            <div style={styles.timerPhase}>
              {phase === "idle" ? "Ready" : phase === "focus" ? "FOCUS" : "BREAK"}
            </div>
            <div style={styles.timerTime}>
              {phase === "idle"
                ? timerMode === "Custom"
                  ? `${customMin}:00`
                  : `${focusMin}:00`
                : timerLabel()}
            </div>

            <div style={styles.row}>
              {!isRunning ? (
                <button onClick={startTimer} style={styles.primaryBtn}>
                  Start
                </button>
              ) : (
                <button onClick={pauseTimer} style={styles.secondaryBtn}>
                  Pause
                </button>
              )}
              <button onClick={resetTimer} style={styles.ghostBtn}>
                Reset
              </button>
            </div>

            <div style={styles.tip}>
              Tip: Put a “Study Block” in your schedule that matches your timer session.
            </div>
          </div>

          <div style={styles.divider} />

          <div style={styles.cardTitleSmall}>Study Tracking</div>
          <div style={styles.studyStats}>
            <div style={styles.stat}>
              <div style={styles.statLabel}>Today</div>
              <div style={styles.statValue}>{minutesToHhMm(todayStudyTotal)}</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statLabel}>This week</div>
              <div style={styles.statValue}>{minutesToHhMm(weeklyStudyTotal)}</div>
            </div>
          </div>

          <div style={styles.list}>
            {Object.keys(todayStudyByCourse).length === 0 ? (
              <div style={styles.empty}>No study time logged today yet. Start a focus session.</div>
            ) : (
              Object.entries(todayStudyByCourse)
                .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                .map(([course, mins]) => (
                  <div key={course} style={styles.listItem}>
                    <div style={styles.listLeft}>
                      <div style={styles.badge}>Course</div>
                      <div>
                        <div style={styles.itemTitle}>{course}</div>
                        <div style={styles.itemSub}>{minutesToHhMm(Number(mins) || 0)}</div>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* RIGHT BOTTOM: Wellness + Courses */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Wellness Check-In</div>
          <div style={styles.cardMeta}>Quick athlete metrics for the day</div>

          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.labelSmall}>Sleep (hours)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={currentWellness.sleepHours}
                onChange={(e) =>
                  saveWellness({ ...currentWellness, sleepHours: Number(e.target.value) })
                }
                style={styles.input}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.labelSmall}>Soreness (1–10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={currentWellness.soreness}
                onChange={(e) =>
                  saveWellness({ ...currentWellness, soreness: Number(e.target.value) })
                }
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.labelSmall}>Stress (1–10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={currentWellness.stress}
                onChange={(e) =>
                  saveWellness({ ...currentWellness, stress: Number(e.target.value) })
                }
                style={styles.input}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.labelSmall}>Energy (1–10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={currentWellness.energy}
                onChange={(e) =>
                  saveWellness({ ...currentWellness, energy: Number(e.target.value) })
                }
                style={styles.input}
              />
            </div>
          </div>

          <textarea
            placeholder="Notes (injury, travel, mood, coach feedback, etc.)"
            value={currentWellness.notes}
            onChange={(e) => saveWellness({ ...currentWellness, notes: e.target.value })}
            style={styles.textarea}
          />

          <div style={styles.divider} />

          <div style={styles.cardTitleSmall}>Courses</div>
          <div style={styles.row}>
            <input
              placeholder="Add course (e.g., COM 215)"
              value={newCourse}
              onChange={(e) => setNewCourse(e.target.value)}
              style={styles.inputWide}
            />
            <button onClick={addCourse} style={styles.primaryBtn}>
              Add
            </button>
          </div>

          <div style={styles.list}>
            {courses.length === 0 ? (
              <div style={styles.empty}>Add at least one course to track study sessions.</div>
            ) : (
              courses.map((c) => (
                <div key={c} style={styles.listItem}>
                  <div style={styles.listLeft}>
                    <div style={styles.badge}>Course</div>
                    <div style={styles.itemTitle}>{c}</div>
                  </div>
                  <button onClick={() => removeCourse(c)} style={styles.dangerBtn}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={styles.tip}>
            Next easy upgrade: streaks, push reminders, and exporting weekly reports.
          </div>
        </div>
      </div>

      <div style={styles.footer}>
        Data saves locally on your device (no account). If you clear browser storage, it resets.
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
    padding: 18,
    maxWidth: 1100,
    margin: "0 auto",
    color: "#111",
  },
  header: {
    display: "flex",
    gap: 16,
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 16,
    flexWrap: "wrap",
  },
  h1: { fontSize: 28, fontWeight: 800, letterSpacing: -0.5 },
  sub: { fontSize: 13, opacity: 0.75, marginTop: 4 },
  dateWrap: { display: "flex", gap: 8, alignItems: "center" },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr",
    gap: 14,
  },
  card: {
    border: "1px solid #e6e6e6",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
    background: "white",
  },
  cardTitle: { fontSize: 18, fontWeight: 800 },
  cardTitleSmall: { fontSize: 15, fontWeight: 800, marginBottom: 8 },
  cardMeta: { fontSize: 12, opacity: 0.7, marginTop: 4, marginBottom: 10 },
  rowWrap: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  label: { fontSize: 12, fontWeight: 700, opacity: 0.7 },
  labelSmall: { fontSize: 11, fontWeight: 700, opacity: 0.7, display: "block" },
  input: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "9px 10px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    minWidth: 140,
  },
  inputWide: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "9px 10px",
    fontSize: 14,
    outline: "none",
    flex: 1,
    minWidth: 220,
  },
  select: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "9px 10px",
    fontSize: 14,
    outline: "none",
    minWidth: 160,
  },
  textarea: {
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 10,
    fontSize: 14,
    outline: "none",
    width: "100%",
    minHeight: 70,
    resize: "vertical",
  },
  primaryBtn: {
    border: "1px solid #111",
    background: "#111",
    color: "white",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 90,
  },
  secondaryBtn: {
    border: "1px solid #111",
    background: "white",
    color: "#111",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 90,
  },
  ghostBtn: {
    border: "1px solid #ddd",
    background: "white",
    color: "#111",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  dangerBtn: {
    border: "1px solid #ffcccc",
    background: "#fff5f5",
    color: "#b00020",
    borderRadius: 12,
    padding: "8px 10px",
    fontWeight: 800,
    cursor: "pointer",
  },
  divider: { height: 1, background: "#eee", margin: "12px 0" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    border: "1px solid #eee",
    borderRadius: 14,
    padding: "10px 10px",
    background: "#fff",
  },
  listLeft: { display: "flex", gap: 10, alignItems: "center" },
  badge: {
    fontSize: 11,
    fontWeight: 900,
    padding: "6px 8px",
    borderRadius: 999,
    background: "#f3f3f3",
    border: "1px solid #e7e7e7",
    whiteSpace: "nowrap",
  },
  itemTitle: { fontSize: 14, fontWeight: 900 },
  itemSub: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  empty: { fontSize: 13, opacity: 0.7, padding: "10px 2px" },
  timerBox: {
    border: "1px solid #eee",
    borderRadius: 16,
    padding: 14,
    background: "#fafafa",
  },
  timerPhase: { fontSize: 12, fontWeight: 900, opacity: 0.7 },
  timerTime: { fontSize: 44, fontWeight: 900, letterSpacing: -1, margin: "6px 0" },
  tip: { fontSize: 12, opacity: 0.7, marginTop: 10 },
  quickBar: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    border: "1px solid #e3e3e3",
    background: "white",
    borderRadius: 999,
    padding: "8px 10px",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
  },
  studyStats: { display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  stat: {
    flex: 1,
    minWidth: 140,
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 10,
    background: "#fff",
  },
  statLabel: { fontSize: 12, opacity: 0.7, fontWeight: 800 },
  statValue: { fontSize: 18, fontWeight: 900, marginTop: 4 },
  footer: { fontSize: 12, opacity: 0.65, marginTop: 14 },
};