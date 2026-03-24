'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Todo' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];

function dayKeyFromDateText(dateText) {
  return dateText.replace(/[, ]+/g, '-').toLowerCase();
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

export default function DashboardClient({ userName }) {
  const router = useRouter();
  const [planner, setPlanner] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [storageMode, setStorageMode] = useState('json');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

        <button onClick={logout} className="ghost-btn" type="button">
          Logout
        </button>
      </header>

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
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="weeks-list">
        {(planner?.weeks || []).map((week) => (
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
                const taskInfo = splitTasks(day);

                return (
                  <div key={key} className="day-card">
                    <div className="day-top-row">
                      <div>
                        <p className="day-date">{day.date}</p>
                        <p className="day-name">{day.name}</p>
                      </div>
                      <p className="hours-chip">{day.hours}h</p>
                    </div>

                    <div className="day-sections">
                      <section className="task-section">
                        <p className="task-section-title">Videos</p>
                        {taskInfo.videos.length ? (
                          <ul className="task-list">
                            {taskInfo.videos.map((item) => (
                              <li key={`${key}-video-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="task-empty">No video target listed.</p>
                        )}
                      </section>

                      <section className="task-section">
                        <p className="task-section-title">DSA Sheet</p>
                        {taskInfo.dsaSheet.length ? (
                          <ul className="task-list">
                            {taskInfo.dsaSheet.map((item) => (
                              <li key={`${key}-dsa-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="task-empty">
                            No DSA sheet item listed.
                          </p>
                        )}
                      </section>

                      <section className="task-section">
                        <p className="task-section-title">IndiaBix</p>
                        {taskInfo.indiabix.length ? (
                          <ul className="task-list">
                            {taskInfo.indiabix.map((item) => (
                              <li key={`${key}-apt-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="task-empty">No IndiaBix item listed.</p>
                        )}
                      </section>

                      {taskInfo.extras.length ? (
                        <section className="task-section">
                          <p className="task-section-title">Other</p>
                          <ul className="task-list">
                            {taskInfo.extras.map((item) => (
                              <li key={`${key}-extra-${item.text}`}>
                                {item.cat ? `${item.cat}: ` : ''}
                                {item.text}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                    </div>

                    <select
                      value={currentStatus}
                      onChange={(event) => setStatus(key, event.target.value)}
                      className="status-select"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
