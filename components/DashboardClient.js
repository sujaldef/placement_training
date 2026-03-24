'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Todo' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];

const THEME_STORAGE_KEY = 'planner-theme';

const ICONS = {
  videos: '▶',
  dsa: '[]',
  indiabix: 'Q',
  other: '+',
};

function dayKeyFromDateText(dateText) {
  return dateText.replace(/[, ]+/g, '-').toLowerCase();
}

function parseDateToTimestamp(dateText) {
  const currentYear = new Date().getFullYear();
  const parsed = Date.parse(`${String(dateText || '').trim()} ${currentYear}`);
  return Number.isNaN(parsed) ? null : parsed;
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function calculateWeekStats(week, statuses) {
  const days = week?.days || [];
  if (!days.length) {
    return { total: 0, done: 0, percent: 0 };
  }

  let done = 0;

  for (const day of days) {
    const key = `${week.id}-${dayKeyFromDateText(day.date)}`;
    if (statuses[key] === 'done') {
      done += 1;
    }
  }

  return {
    total: days.length,
    done,
    percent: Math.round((done / days.length) * 100),
  };
}

function calculateBestDoneStreak(weeks, statuses) {
  const timeline = [];

  for (const week of weeks || []) {
    for (const day of week?.days || []) {
      const key = `${week.id}-${dayKeyFromDateText(day.date)}`;
      const timestamp = parseDateToTimestamp(day.date);
      timeline.push({
        key,
        status: statuses[key] || 'todo',
        timestamp: timestamp ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  timeline.sort((a, b) => a.timestamp - b.timestamp);

  let current = 0;
  let best = 0;

  for (const entry of timeline) {
    if (entry.status === 'done') {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

function splitTasks(day) {
  const result = {
    videos: [],
    dsaSheet: [],
    indiabix: [],
    extras: [],
  };

  for (const task of day?.tasks || []) {
    const text = String(task?.text || '').trim();
    const cat = String(task?.cat || '').toUpperCase();

    if (!text) {
      continue;
    }

    if (cat === 'DSA' && /\bvideos?\b/i.test(text)) {
      result.videos.push(text);
      continue;
    }

    if (cat === 'DSA') {
      result.dsaSheet.push(text);
      continue;
    }

    if (cat === 'APT' || /\bindiabix\b/i.test(text)) {
      result.indiabix.push(text);
      continue;
    }

    result.extras.push({ cat, text });
  }

  return result;
}

function DayCard({
  day,
  dayKey,
  status,
  isOverdue,
  onStatusChange,
  onQuickDone,
}) {
  const taskInfo = splitTasks(day);
  const cardVariant = isOverdue ? 'overdue' : status;

  return (
    <article className={`day-card day-card--${cardVariant}`}>
      <div className="day-top-row">
        <div>
          <p className="day-date">{day.date}</p>
          <p className="day-name">{day.name}</p>
        </div>
        <p className="hours-chip">{day.hours}h</p>
      </div>

      <div className="day-sections">
        <section className="task-section">
          <p className="task-section-title">
            <span className="task-icon">{ICONS.videos}</span>
            Videos
          </p>
          {taskInfo.videos.length ? (
            <ul className="task-list">
              {taskInfo.videos.map((item) => (
                <li key={`${dayKey}-video-${item}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="task-empty">No video target listed.</p>
          )}
        </section>

        <section className="task-section">
          <p className="task-section-title">
            <span className="task-icon">{ICONS.dsa}</span>
            DSA Sheet
          </p>
          {taskInfo.dsaSheet.length ? (
            <ul className="task-list">
              {taskInfo.dsaSheet.map((item) => (
                <li key={`${dayKey}-dsa-${item}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="task-empty">No DSA sheet item listed.</p>
          )}
        </section>

        <section className="task-section">
          <p className="task-section-title">
            <span className="task-icon">{ICONS.indiabix}</span>
            IndiaBix
          </p>
          {taskInfo.indiabix.length ? (
            <ul className="task-list">
              {taskInfo.indiabix.map((item) => (
                <li key={`${dayKey}-apt-${item}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="task-empty">No IndiaBix item listed.</p>
          )}
        </section>

        {taskInfo.extras.length ? (
          <section className="task-section">
            <p className="task-section-title">
              <span className="task-icon">{ICONS.other}</span>
              Other
            </p>
            <ul className="task-list">
              {taskInfo.extras.map((item) => (
                <li key={`${dayKey}-extra-${item.text}`}>
                  {item.cat ? `${item.cat}: ` : ''}
                  {item.text}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="day-actions-row">
        <select
          value={status}
          onChange={(event) => onStatusChange(dayKey, event.target.value)}
          className="status-select"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="quick-done-btn"
          onClick={() => onQuickDone(dayKey)}
          disabled={status === 'done'}
        >
          Mark Done
        </button>
      </div>
    </article>
  );
}

export default function DashboardClient({ userName }) {
  const router = useRouter();
  const [planner, setPlanner] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [storageMode, setStorageMode] = useState('json');
  const [theme, setTheme] = useState('dark');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [plannerRes, progressRes] = await Promise.all([
          fetch('/api/planner'),
          fetch('/api/progress'),
        ]);

        if (!plannerRes.ok || !progressRes.ok) {
          throw new Error('Failed to load dashboard data');
        }

        const plannerData = await plannerRes.json();
        const progressData = await progressRes.json();

        if (!mounted) {
          return;
        }

        setPlanner(plannerData);
        setStatuses(progressData.statuses || {});
        setStorageMode(progressData.storageMode || 'json');
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message || 'Failed to load dashboard.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    const statusValues = Object.values(statuses);
    return {
      todo: statusValues.filter((value) => value === 'todo').length,
      review: statusValues.filter((value) => value === 'review').length,
      done: statusValues.filter((value) => value === 'done').length,
    };
  }, [statuses]);

  const filterOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'All Weeks / Dates' }];

    for (const week of planner?.weeks || []) {
      options.push({
        value: `week:${week.id}`,
        label: `Week ${week.num}: ${week.title}`,
      });

      for (const day of week.days || []) {
        const key = `${week.id}-${dayKeyFromDateText(day.date)}`;
        options.push({
          value: `day:${key}`,
          label: `Week ${week.num} - ${day.date}`,
        });
      }
    }

    return options;
  }, [planner]);

  const scopedAndFilteredWeeks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const today = startOfToday();

    return (planner?.weeks || [])
      .map((week) => {
        const includeWeek =
          scopeFilter === 'all' || scopeFilter === `week:${week.id}`;

        const days = (week.days || []).filter((day) => {
          const key = `${week.id}-${dayKeyFromDateText(day.date)}`;
          const currentStatus = statuses[key] || 'todo';

          if (scopeFilter.startsWith('day:') && scopeFilter !== `day:${key}`) {
            return false;
          }

          if (!includeWeek && !scopeFilter.startsWith('day:')) {
            return false;
          }

          if (statusFilter !== 'all' && currentStatus !== statusFilter) {
            return false;
          }

          if (!query) {
            return true;
          }

          const joinedTasks = (day.tasks || [])
            .map((task) => `${task.cat || ''} ${task.text || ''}`)
            .join(' ')
            .toLowerCase();
          const searchable =
            `${day.name || ''} ${day.date || ''} ${joinedTasks}`.toLowerCase();

          return searchable.includes(query);
        });

        return {
          ...week,
          days,
          stats: calculateWeekStats(week, statuses),
          overdueCount: days.filter((day) => {
            const key = `${week.id}-${dayKeyFromDateText(day.date)}`;
            const timestamp = parseDateToTimestamp(day.date);
            return (
              timestamp !== null &&
              timestamp < today &&
              statuses[key] !== 'done'
            );
          }).length,
        };
      })
      .filter((week) => week.days.length > 0);
  }, [planner, searchQuery, scopeFilter, statusFilter, statuses]);

  const bestStreak = useMemo(() => {
    return calculateBestDoneStreak(planner?.weeks || [], statuses);
  }, [planner, statuses]);

  const visibleDayCount = useMemo(() => {
    return scopedAndFilteredWeeks.reduce(
      (sum, week) => sum + week.days.length,
      0,
    );
  }, [scopedAndFilteredWeeks]);

  async function setStatus(dayKey, nextStatus) {
    const previous = statuses[dayKey];
    setStatuses((current) => ({ ...current, [dayKey]: nextStatus }));

    try {
      const response = await fetch('/api/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayKey, status: nextStatus }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save progress');
      }

      setStorageMode(payload.storageMode || 'json');
    } catch (saveError) {
      setStatuses((current) => ({ ...current, [dayKey]: previous || 'todo' }));
      setError(saveError.message || 'Unable to save progress');
    }
  }

  function setDoneQuick(dayKey) {
    setStatus(dayKey, 'done');
  }

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  if (loading) {
    return <p className="muted">Loading your dashboard...</p>;
  }

  if (error && !planner) {
    return <p className="error-text">{error}</p>;
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Placement Planner Dashboard</p>
          <h1>{userName}</h1>
          <p className="muted">Storage mode: {storageMode}</p>
        </div>

        <div className="header-actions">
          <button
            onClick={toggleTheme}
            className="theme-toggle"
            type="button"
            aria-label="Toggle color theme"
          >
            <span className="theme-dot" />
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          <button onClick={logout} className="ghost-btn" type="button">
            Logout
          </button>
        </div>
      </header>

      <section className="filter-bar">
        <label>
          Search
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by date, task, or content"
          />
        </label>

        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All</option>
            <option value="todo">Todo</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        </label>

        <label>
          Week / Date
          <select
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value)}
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="stats-grid">
        <article>
          <p className="stat-label">Todo</p>
          <p className="stat-value">{totals.todo}</p>
        </article>
        <article>
          <p className="stat-label">Review</p>
          <p className="stat-value">{totals.review}</p>
        </article>
        <article>
          <p className="stat-label">Done</p>
          <p className="stat-value">{totals.done}</p>
        </article>
        <article>
          <p className="stat-label">Best Streak</p>
          <p className="stat-value">{bestStreak} days</p>
        </article>
        <article>
          <p className="stat-label">Visible Tasks</p>
          <p className="stat-value">{visibleDayCount}</p>
        </article>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="weeks-list">
        {scopedAndFilteredWeeks.map((week) => (
          <article key={week.id} className="week-card">
            <div className="week-headline">
              <div>
                <h2>
                  {week.milestone?.icon ? `${week.milestone.icon} ` : ''}
                  Week {week.num}: {week.title}
                </h2>
                <p className="muted">{week.dateRange}</p>
              </div>
              <span className="phase-badge">
                {String(week.phase || '').toUpperCase()}
              </span>
            </div>

            <div className="week-progress-row">
              <p className="muted">
                Week progress: {week.stats.done}/{week.stats.total} done (
                {week.stats.percent}%)
              </p>
              {week.overdueCount > 0 ? (
                <p className="overdue-pill">Overdue: {week.overdueCount}</p>
              ) : null}
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={week.stats.percent}
            >
              <progress
                className="progress-fill"
                value={week.stats.percent}
                max={100}
              />
            </div>

            {week.milestone?.title ? (
              <div className="milestone-strip">
                <p className="milestone-title">{week.milestone.title}</p>
                {week.milestone?.sub ? (
                  <p className="milestone-sub">{week.milestone.sub}</p>
                ) : null}
              </div>
            ) : null}

            <div className="days-grid">
              {(week.days || []).map((day) => {
                const key = `${week.id}-${dayKeyFromDateText(day.date)}`;
                const currentStatus = statuses[key] || 'todo';
                const timestamp = parseDateToTimestamp(day.date);
                const isOverdue =
                  timestamp !== null &&
                  timestamp < startOfToday() &&
                  currentStatus !== 'done';

                return (
                  <DayCard
                    key={key}
                    day={day}
                    dayKey={key}
                    status={currentStatus}
                    isOverdue={isOverdue}
                    onStatusChange={setStatus}
                    onQuickDone={setDoneQuick}
                  />
                );
              })}
            </div>
          </article>
        ))}

        {!scopedAndFilteredWeeks.length ? (
          <article className="week-card empty-state-card">
            <h2>No results</h2>
            <p className="muted">
              Try clearing filters or adjusting your search query.
            </p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
