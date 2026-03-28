'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Todo' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];

const THEME_STORAGE_KEY = 'planner-theme';
const ITEM_CHECKS_STORAGE_KEY = 'planner-item-checks';

const DEFAULT_SETTINGS = {
  startDate: `${new Date().getFullYear()}-03-01`,
  startVideoPosition: 1,
  startDsaTopicId: '',
  startAptitudeId: '',
};

const ACTION_LABELS = {
  videos: { icon: '▶', label: 'Watch' },
  dsaSheet: { icon: '↗', label: 'Solve' },
  indiabix: { icon: '↗', label: 'Practice' },
  extras: { icon: '↗', label: 'Open' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePlannerSettings(rawSettings) {
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const date = String(raw.startDate || DEFAULT_SETTINGS.startDate).trim();
  const video = Number.parseInt(String(raw.startVideoPosition || 1), 10);
  const startVideoPosition = Number.isFinite(video) && video > 0 ? video : 1;
  const startDsaTopicId = String(raw.startDsaTopicId || '').trim();
  const aptitudeRaw = String(raw.startAptitudeId || '').trim();
  const startAptitudeId =
    aptitudeRaw && aptitudeRaw !== 'none' ? aptitudeRaw : '';
  return {
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : DEFAULT_SETTINGS.startDate,
    startVideoPosition,
    startDsaTopicId,
    startAptitudeId,
  };
}

function buildPlannerQuery(settings) {
  const n = normalizePlannerSettings(settings);
  const s = new URLSearchParams();
  s.set('startDate', n.startDate);
  s.set('startVideoPosition', String(n.startVideoPosition));
  s.set('startDsaTopicId', n.startDsaTopicId);
  s.set('startAptitudeId', n.startAptitudeId || 'none');
  return s.toString();
}

function dayKeyFromDateText(dateText) {
  return dateText.replace(/[, ]+/g, '-').toLowerCase();
}

function parseDateToTimestamp(dateText, isoDate) {
  const iso = String(isoDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const p = Date.parse(`${iso}T00:00:00`);
    if (!Number.isNaN(p)) return p;
  }
  const p = Date.parse(
    `${String(dateText || '').trim()} ${new Date().getFullYear()}`,
  );
  return Number.isNaN(p) ? null : p;
}

function startOfToday() {
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  return n.getTime();
}

function calculateWeekStats(week, statuses) {
  const days = week?.days || [];
  if (!days.length) return { total: 0, done: 0, percent: 0 };
  let done = 0;
  for (const day of days) {
    if (statuses[`${week.id}-${dayKeyFromDateText(day.date)}`] === 'done')
      done++;
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
      const ts = parseDateToTimestamp(day.date, day.isoDate);
      timeline.push({
        status: statuses[key] || 'todo',
        timestamp: ts ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }
  timeline.sort((a, b) => a.timestamp - b.timestamp);
  let cur = 0,
    best = 0;
  for (const e of timeline) {
    if (e.status === 'done') {
      cur++;
      best = Math.max(best, cur);
    } else cur = 0;
  }
  return best;
}

function parseVideoNumberFromTask(task) {
  const mapId = String(task?.mapId || '').trim();
  const fromMap = mapId.match(/^v-(\d+)$/i);
  if (fromMap) return Number.parseInt(fromMap[1], 10);

  const text = String(task?.text || '').trim();
  const fromText = text.match(/video\s*#\s*(\d+)/i);
  if (fromText) return Number.parseInt(fromText[1], 10);
  return null;
}

function isVideoTask(task) {
  const text = String(task?.text || '').trim();
  if (/^video\s*#/i.test(text)) return true;
  return (
    String(task?.linkLabel || '')
      .trim()
      .toLowerCase() === 'watch'
  );
}

function getTaskItemKey(dayKey, task) {
  const cat = String(task?.cat || '')
    .trim()
    .toLowerCase();
  const mapId = String(task?.mapId || '')
    .trim()
    .toLowerCase();
  const text = String(task?.text || '')
    .trim()
    .toLowerCase();
  const link = String(task?.link || '')
    .trim()
    .toLowerCase();
  return `${dayKey}|${cat}|${mapId}|${text}|${link}`;
}

function getTaskActionLabel(task, bucket) {
  const kind = String(task?.itemKind || '').trim();
  if (kind === 'video') return 'Watch';
  if (kind === 'dsa') return 'Solve';
  const explicit = String(task?.linkLabel || '').trim();
  if (explicit) return explicit;
  return (ACTION_LABELS[bucket] || ACTION_LABELS.extras).label;
}

function getAllDayTaskItemKeys(day, dayKey) {
  const keys = [];
  for (const task of day?.tasks || []) {
    const text = String(task?.text || '').trim();
    if (!text) continue;
    keys.push(getTaskItemKey(dayKey, task));
  }
  return keys;
}

function splitTasks(day) {
  const r = { videoDsaGroups: [], indiabix: [], revision: [], extras: [] };
  const groupMap = new Map();
  let standaloneCount = 0;

  const ensureGroup = (id, title) => {
    const existing = groupMap.get(id);
    if (existing) return existing;
    const created = { id, title, items: [] };
    groupMap.set(id, created);
    r.videoDsaGroups.push(created);
    return created;
  };

  for (const task of day?.tasks || []) {
    const text = String(task?.text || '').trim();
    const cat = String(task?.cat || '').toUpperCase();
    if (!text) continue;

    if (cat === 'DSA') {
      const videoNumber = parseVideoNumberFromTask(task);
      const rawMapId = String(task?.mapId || '').trim();
      let groupId = '';

      if (rawMapId) groupId = rawMapId;
      else if (videoNumber !== null) groupId = `v-${videoNumber}`;
      else {
        standaloneCount += 1;
        groupId = `standalone-${standaloneCount}`;
      }

      let title = 'DSA Practice';
      if (videoNumber !== null) title = `Video #${videoNumber}`;
      else {
        const idMatch = groupId.match(/^v-(\d+)$/i);
        if (idMatch) title = `Video #${idMatch[1]}`;
      }

      const group = ensureGroup(groupId, title);
      group.items.push({
        ...task,
        itemKind: isVideoTask(task) ? 'video' : 'dsa',
      });
      continue;
    }

    if (cat === 'APT' || /\bindiabix\b/i.test(text)) {
      r.indiabix.push(task);
      continue;
    }
    if (cat === 'REV') {
      r.revision.push(task);
      continue;
    }
    r.extras.push(task);
  }
  return r;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:         #F7F6F3;
  --surface:    #FFFFFF;
  --surface-2:  #F2F1EE;
  --surface-3:  #ECEAE5;
  --border:     #E4E2DC;
  --border-hi:  #D0CEC6;
  --text-1:     #1A1917;
  --text-2:     #6B6860;
  --text-3:     #A8A69E;
  --accent:     #2563EB;
  --accent-bg:  #EFF4FF;
  --accent-txt: #1D4ED8;
  --green:      #16A34A;
  --green-bg:   #F0FDF4;
  --green-txt:  #15803D;
  --amber:      #D97706;
  --amber-bg:   #FFFBEB;
  --red:        #DC2626;
  --red-bg:     #FEF2F2;
  --red-txt:    #B91C1C;
  --radius:     10px;
  --radius-lg:  14px;
  --sans:       'Instrument Sans', system-ui, sans-serif;
  --serif:      'Instrument Serif', Georgia, serif;
  --mono:       'JetBrains Mono', monospace;
  --shadow:     0 1px 3px rgba(0,0,0,0.07), 0 4px 14px rgba(0,0,0,0.05);
  --shadow-lg:  0 8px 32px rgba(0,0,0,0.12);
  --t:          0.15s cubic-bezier(0.4,0,0.2,1);
}

[data-theme="dark"] {
  --bg:         #111110;
  --surface:    #1C1C1A;
  --surface-2:  #252523;
  --surface-3:  #2E2E2B;
  --border:     #2E2E2B;
  --border-hi:  #3D3D39;
  --text-1:     #F0EFE9;
  --text-2:     #9A9890;
  --text-3:     #5A5A54;
  --accent:     #3B82F6;
  --accent-bg:  #1D2B4A;
  --accent-txt: #93C5FD;
  --green:      #22C55E;
  --green-bg:   #14261C;
  --green-txt:  #86EFAC;
  --amber:      #F59E0B;
  --amber-bg:   #271E0E;
  --red:        #EF4444;
  --red-bg:     #2A1515;
  --red-txt:    #FCA5A5;
  --shadow:     0 1px 3px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.3);
  --shadow-lg:  0 8px 32px rgba(0,0,0,0.5);
}

html, body { height: 100%; background: var(--bg); }

body {
  font-family: var(--sans);
  color: var(--text-1);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* Shell */
.pp { min-height: 100vh; display: flex; flex-direction: column; }

/* Nav */
.pp-nav {
  position: sticky; top: 0; z-index: 100;
  height: 52px;
  background: rgba(247,246,243,0.92);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center;
  padding: 0 24px; gap: 10px;
}
[data-theme="dark"] .pp-nav { background: rgba(17,17,16,0.92); }

.pp-brand {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.pp-brand-icon {
  width: 28px; height: 28px; border-radius: 7px;
  background: var(--text-1); color: var(--bg);
  display: flex; align-items: center; justify-content: center;
}
.pp-brand-name { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }

.pp-nav-gap { flex: 1; }

.pp-nav-right { display: flex; align-items: center; gap: 6px; }
.pp-nav-divider { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }

.pp-social-link {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  color: var(--text-3); text-decoration: none;
  transition: color var(--t), background var(--t);
}
.pp-social-link:hover { color: var(--text-1); background: var(--surface-2); }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 30px; padding: 0 11px; border-radius: 6px;
  font-family: var(--sans); font-size: 13px; font-weight: 500;
  cursor: pointer; border: 1px solid transparent;
  transition: background var(--t), color var(--t), border-color var(--t);
  white-space: nowrap;
}
.btn-sm { height: 26px; padding: 0 9px; font-size: 12px; }
.btn-ghost { background: transparent; color: var(--text-2); border-color: var(--border); }
.btn-ghost:hover { background: var(--surface-2); color: var(--text-1); border-color: var(--border-hi); }
.btn-solid { background: var(--text-1); color: var(--bg); }
.btn-solid:hover { opacity: 0.85; }
.btn-danger { background: transparent; color: var(--red); border-color: rgba(220,38,38,0.25); }
.btn-danger:hover { background: var(--red-bg); }
.btn-green  { background: var(--green); color: #fff; border-color: transparent; }
.btn-green:hover:not(:disabled) { opacity: 0.88; }
.btn:disabled { opacity: 0.38; cursor: not-allowed; pointer-events: none; }

/* Main */
.pp-main {
  flex: 1;
  max-width: 960px; width: 100%;
  margin: 0 auto;
  padding: 32px 24px 80px;
  display: flex; flex-direction: column; gap: 32px;
}

/* Stats strip */
.pp-stats {
  display: grid; grid-template-columns: repeat(4,1fr);
  gap: 1px; background: var(--border);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  overflow: hidden;
}
.pp-stat { background: var(--surface); padding: 15px 18px; }
.pp-stat-lbl {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--text-3); margin-bottom: 3px;
}
.pp-stat-val {
  font-size: 26px; font-weight: 600; letter-spacing: -0.04em;
  line-height: 1; font-variant-numeric: tabular-nums; color: var(--text-1);
}
.pp-stat-val.green  { color: var(--green); }
.pp-stat-val.amber  { color: var(--amber); }
.pp-stat-val.accent { color: var(--accent); }

/* Section */
.pp-section-head {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 14px;
}
.pp-section-title { font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
.pp-section-meta  { font-size: 12px; color: var(--text-3); }
.pp-section-actions { display: flex; align-items: center; gap: 8px; }

/* Today panel */
.pp-today {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow);
}
.pp-today-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 18px 20px 14px; border-bottom: 1px solid var(--border);
}
.pp-today-eyebrow {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-3); margin-bottom: 3px;
}
.pp-today-title {
  font-family: var(--serif); font-size: 20px;
  color: var(--text-1); letter-spacing: -0.02em; line-height: 1.25;
}
.pp-today-chips { display: flex; align-items: center; gap: 6px; margin-top: 2px; }

.pp-chip {
  display: inline-flex; align-items: center;
  height: 22px; padding: 0 9px; border-radius: 99px;
  font-size: 11px; font-weight: 600;
}
.pp-chip-hrs  { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); font-family: var(--mono); }
.pp-chip-todo   { background: var(--surface-2); color: var(--text-2); }
.pp-chip-review { background: var(--amber-bg);  color: var(--amber);  }
.pp-chip-done   { background: var(--green-bg);  color: var(--green);  }
.pp-chip-overdue{ background: var(--red-bg);    color: var(--red);    }

/* Task groups in today panel */
.pp-groups { display: flex; flex-direction: column; }
.pp-group { border-bottom: 1px solid var(--border); }
.pp-group:last-child { border-bottom: none; }

.pp-group-btn {
  display: flex; align-items: center; width: 100%;
  padding: 12px 20px; gap: 10px;
  background: none; border: none; cursor: pointer; text-align: left;
  transition: background var(--t);
}
.pp-group-btn:hover { background: var(--surface-2); }

.pp-group-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.pp-group-dot.dsa   { background: var(--accent); }
.pp-group-dot.bix   { background: var(--amber);  }
.pp-group-dot.rev   { background: var(--green);  }
.pp-group-dot.other { background: var(--border-hi); }

.pp-group-name  { font-size: 13px; font-weight: 600; color: var(--text-1); flex: 1; }
.pp-group-count { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.pp-group-arrow {
  font-size: 9px; color: var(--text-3);
  transition: transform 0.18s; flex-shrink: 0;
}
.pp-group-arrow.open { transform: rotate(180deg); }

.pp-group-body {
  padding: 4px 20px 12px 37px;
  display: flex; flex-direction: column; gap: 4px;
}
.pp-group-task {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}
.pp-group-task:last-child { border-bottom: none; }
.pp-group-task-text { flex: 1; font-size: 13px; color: var(--text-2); line-height: 1.5; }
.pp-group-task-text.done,
.pp-exp-text.done { text-decoration: line-through; color: var(--text-3); }
.pp-task-link-btn {
  display: inline-flex; align-items: center; gap: 3px;
  height: 24px; padding: 0 9px; border-radius: 5px;
  font-size: 11px; font-weight: 500;
  background: var(--accent-bg); color: var(--accent-txt);
  border: 1px solid rgba(37,99,235,0.15);
  text-decoration: none; flex-shrink: 0;
  transition: background var(--t);
}
.pp-task-link-btn:hover { background: rgba(37,99,235,0.18); }

.pp-video-block {
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
  padding: 8px 10px;
}
.pp-video-block + .pp-video-block { margin-top: 8px; }
.pp-video-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 3px;
}

.pp-item-check {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--border-hi);
  background: var(--surface);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 1px;
}
.pp-item-check.done {
  background: var(--green);
  border-color: var(--green);
}

.pp-mini-tag {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  flex-shrink: 0;
  margin-top: 1px;
}
.pp-mini-tag.video { background: var(--accent-bg); color: var(--accent-txt); }
.pp-mini-tag.dsa   { background: var(--green-bg);  color: var(--green-txt); }
.pp-mini-tag.apt   { background: var(--amber-bg);  color: var(--amber); }
.pp-mini-tag.rev   { background: var(--surface-3); color: var(--text-2); }
.pp-mini-tag.etc   { background: var(--surface-3); color: var(--text-2); }

.pp-today-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 20px; background: var(--surface-2);
  border-top: 1px solid var(--border); gap: 10px;
}
.pp-status-sel {
  height: 30px; padding: 0 10px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text-1); font-family: var(--sans); font-size: 13px;
  font-weight: 500; cursor: pointer; outline: none;
  transition: border-color var(--t);
}
.pp-status-sel:focus { border-color: var(--accent); }

.pp-today-empty {
  padding: 44px 20px; text-align: center;
  color: var(--text-3); font-size: 14px;
}

/* Error */
.pp-error {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 6px;
  background: var(--red-bg); color: var(--red);
  border: 1px solid rgba(220,38,38,0.2); font-size: 13px;
}

/* Filters */
.pp-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.pp-search, .pp-sel {
  height: 32px; padding: 0 11px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text-1); font-family: var(--sans); font-size: 13px;
  outline: none; transition: border-color var(--t);
}
.pp-search { flex: 1; min-width: 180px; }
.pp-search::placeholder { color: var(--text-3); }
.pp-search:focus, .pp-sel:focus { border-color: var(--accent); }
.pp-sel { cursor: pointer; }

/* Week list */
.pp-weeks { display: flex; flex-direction: column; gap: 2px; }

.pp-week {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
}

.pp-week-btn {
  display: flex; align-items: center; width: 100%;
  padding: 13px 16px; gap: 12px;
  background: none; border: none; cursor: pointer; text-align: left;
  transition: background var(--t);
}
.pp-week-btn:hover { background: var(--surface-2); }

/* Circular progress */
.pp-ring { flex-shrink: 0; }
.pp-ring svg { display: block; transform: rotate(-90deg); }
.pp-ring-bg   { fill: none; stroke: var(--border); stroke-width: 2.5; }
.pp-ring-fill {
  fill: none; stroke: var(--green); stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.5s cubic-bezier(0.4,0,0.2,1);
}

.pp-week-info { flex: 1; min-width: 0; }
.pp-week-name { font-size: 13px; font-weight: 600; color: var(--text-1); letter-spacing: -0.01em; }
.pp-week-date { font-size: 11px; color: var(--text-3); margin-top: 1px; }

.pp-week-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.pp-badge {
  display: inline-flex; align-items: center;
  height: 20px; padding: 0 7px; border-radius: 4px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
}
.pp-badge-phase   { background: var(--surface-2); color: var(--text-3); border: 1px solid var(--border); }
.pp-badge-done    { background: var(--green-bg);  color: var(--green-txt); }
.pp-badge-overdue { background: var(--red-bg);    color: var(--red-txt); }

.pp-week-arrow {
  font-size: 9px; color: var(--text-3);
  transition: transform 0.18s; flex-shrink: 0;
}
.pp-week-arrow.open { transform: rotate(180deg); }

/* Day rows */
.pp-week-body { border-top: 1px solid var(--border); }

.pp-day-row {
  display: flex; align-items: center;
  padding: 10px 16px; gap: 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--t);
}
.pp-day-row:last-child { border-bottom: none; }
.pp-day-row:hover { background: var(--surface-2); }

.pp-day-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.pp-day-dot.todo    { background: var(--border-hi); }
.pp-day-dot.review  { background: var(--amber); }
.pp-day-dot.done    { background: var(--green); }
.pp-day-dot.overdue { background: var(--red); }

.pp-day-info { flex: 1; min-width: 0; }
.pp-day-name { font-size: 13px; font-weight: 500; color: var(--text-1); }
.pp-day-preview {
  font-size: 11px; color: var(--text-3); margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.pp-day-hours-txt { font-size: 11px; color: var(--text-3); font-family: var(--mono); flex-shrink: 0; }

.pp-day-actions {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}

.pp-inline-sel {
  height: 26px; padding: 0 8px; border-radius: 5px;
  border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text-1); font-family: var(--sans); font-size: 12px;
  cursor: pointer; outline: none;
}
.pp-inline-sel:focus { border-color: var(--accent); }

/* Expanded day */
.pp-day-expanded {
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  padding: 12px 16px 14px 35px;
  display: flex; flex-direction: column; gap: 6px;
}
.pp-exp-task {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 7px 10px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px;
}
.pp-exp-cat {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2px 5px; border-radius: 3px;
  flex-shrink: 0; margin-top: 2px;
}
.pp-exp-cat.dsa { background: var(--accent-bg); color: var(--accent-txt); }
.pp-exp-cat.bix { background: var(--amber-bg);  color: var(--amber); }
.pp-exp-cat.rev { background: var(--green-bg);  color: var(--green-txt); }
.pp-exp-cat.etc { background: var(--surface-2); color: var(--text-2); }

.pp-exp-text { flex: 1; font-size: 12.5px; color: var(--text-2); line-height: 1.5; }
.pp-exp-link {
  display: inline-flex; align-items: center;
  height: 22px; padding: 0 8px; border-radius: 4px;
  font-size: 11px; font-weight: 500;
  background: var(--accent-bg); color: var(--accent-txt);
  border: 1px solid rgba(37,99,235,0.15);
  text-decoration: none; flex-shrink: 0;
  transition: background var(--t);
}
.pp-exp-link:hover { background: rgba(37,99,235,0.18); }

.pp-day-exp-footer {
  display: flex; align-items: center; gap: 8px;
  padding-top: 8px; border-top: 1px solid var(--border);
}

.pp-exp-video {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 6px;
  padding: 8px;
}
.pp-exp-video + .pp-exp-video { margin-top: 8px; }
.pp-exp-video-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-3);
  text-transform: uppercase;
  margin: 1px 2px 6px;
}

/* Milestone */
.pp-milestone {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 16px; font-size: 12px;
  color: var(--green-txt); font-weight: 500;
  background: var(--green-bg); border-bottom: 1px solid rgba(22,163,74,0.12);
}

/* Empty */
.pp-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px;
  padding: 52px 24px; text-align: center;
  background: var(--surface); border: 1px dashed var(--border-hi);
  border-radius: var(--radius-lg);
}
.pp-empty-ico   { font-size: 22px; opacity: 0.3; }
.pp-empty-title { font-size: 14px; font-weight: 600; color: var(--text-2); }
.pp-empty-sub   { font-size: 12px; color: var(--text-3); }

/* Loading */
.pp-loading {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: 80vh; gap: 12px;
  color: var(--text-3); font-size: 13px;
}
.pp-spinner {
  width: 22px; height: 22px;
  border: 2px solid var(--border); border-top-color: var(--text-1);
  border-radius: 50%; animation: spin 0.75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Modal */
.pp-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.38); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.pp-modal {
  background: var(--surface); border: 1px solid var(--border-hi);
  border-radius: var(--radius-lg); width: 100%; max-width: 500px;
  box-shadow: var(--shadow-lg); overflow: hidden;
}
.pp-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
}
.pp-modal-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.pp-modal-body  { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.pp-modal-desc  {
  font-size: 12px; color: var(--text-2); line-height: 1.6;
  padding: 9px 11px; background: var(--surface-2);
  border-radius: 6px; border-left: 2px solid var(--accent);
}
.pp-field { display: flex; flex-direction: column; gap: 4px; }
.pp-field-lbl {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-3);
}
.pp-field-input, .pp-field-sel {
  height: 34px; padding: 0 10px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text-1); font-family: var(--sans); font-size: 13px;
  outline: none; transition: border-color var(--t);
}
.pp-field-input:focus, .pp-field-sel:focus { border-color: var(--accent); }
.pp-modal-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 13px 20px; border-top: 1px solid var(--border);
  background: var(--surface-2);
}

/* Responsive */
@media (max-width: 640px) {
  .pp-nav  { padding: 0 16px; }
  .pp-main { padding: 20px 16px 60px; gap: 24px; }
  .pp-stats { grid-template-columns: repeat(2,1fr); }
  .pp-day-preview { display: none; }
  .pp-brand-name { display: none; }
}
`;

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('pp-s3')) return;
  const el = document.createElement('style');
  el.id = 'pp-s3';
  el.textContent = STYLES;
  document.head.appendChild(el);
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function GitHubIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6a4.8 4.8 0 0 1 1.2-3.3c-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.1 11.1 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1a4.8 4.8 0 0 1 1.2 3.3c0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A12 12 0 0 0 12 .5z" />
    </svg>
  );
}

function LinkedInIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5zM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-.9 1.8-2 3.8-2 4 0 4.7 2.6 4.7 6V21h-4v-5.2c0-1.3 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V21h-4z" />
    </svg>
  );
}

// ─── Circular progress ring ───────────────────────────────────────────────────

function Ring({ percent, size = 34 }) {
  const r = (size - 5) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <div className="pp-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className="pp-ring-bg" cx={size / 2} cy={size / 2} r={r} />
        <circle
          className="pp-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
    </div>
  );
}

// ─── Collapsible task group (in today panel) ──────────────────────────────────

function TaskGroup({
  dot,
  label,
  items,
  dayKey,
  dayItemKeys,
  bucket,
  defaultOpen,
  itemChecks,
  onToggleItem,
  showBadges = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!items.length) return null;
  return (
    <div className="pp-group">
      <button
        type="button"
        className="pp-group-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`pp-group-dot ${dot}`} />
        <span className="pp-group-name">{label}</span>
        <span className="pp-group-count">{items.length}</span>
        <span className={`pp-group-arrow ${open ? 'open' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="pp-group-body">
          {items.map((task, i) => {
            const text = String(task?.text || '').trim();
            const link = String(task?.link || '').trim();
            const itemKey = getTaskItemKey(dayKey, task);
            const checked = Boolean(itemChecks?.[itemKey]);
            const actionLabel = getTaskActionLabel(task, bucket);
            const tag = String(task?.itemKind || '').trim();
            return (
              <div key={`${dayKey}-${bucket}-${i}`} className="pp-group-task">
                <button
                  type="button"
                  className={`pp-item-check ${checked ? 'done' : ''}`}
                  onClick={() =>
                    onToggleItem?.(dayKey, itemKey, dayItemKeys || [])
                  }
                  aria-label={
                    checked ? 'Mark item as pending' : 'Mark item as done'
                  }
                  aria-pressed={checked}
                >
                  {checked ? '✓' : ''}
                </button>
                {showBadges && tag && (
                  <span className={`pp-mini-tag ${tag}`}>
                    {tag.toUpperCase()}
                  </span>
                )}
                <span className={`pp-group-task-text ${checked ? 'done' : ''}`}>
                  {text}
                </span>
                {link && (
                  <a
                    href={link}
                    className="pp-task-link-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {actionLabel} ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VideoDsaGroup({
  groups,
  dayKey,
  dayItemKeys,
  itemChecks,
  onToggleItem,
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!groups.length) return null;
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="pp-group">
      <button
        type="button"
        className="pp-group-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="pp-group-dot dsa" />
        <span className="pp-group-name">Video + DSA</span>
        <span className="pp-group-count">{count}</span>
        <span className={`pp-group-arrow ${open ? 'open' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="pp-group-body">
          {groups.map((group) => (
            <div key={`${dayKey}-${group.id}`} className="pp-video-block">
              <p className="pp-video-title">{group.title}</p>
              {group.items.map((task, i) => {
                const text = String(task?.text || '').trim();
                const link = String(task?.link || '').trim();
                const itemKey = getTaskItemKey(dayKey, task);
                const checked = Boolean(itemChecks?.[itemKey]);
                return (
                  <div
                    key={`${dayKey}-${group.id}-${i}`}
                    className="pp-group-task"
                  >
                    <button
                      type="button"
                      className={`pp-item-check ${checked ? 'done' : ''}`}
                      onClick={() =>
                        onToggleItem?.(dayKey, itemKey, dayItemKeys || [])
                      }
                      aria-label={
                        checked ? 'Mark item as pending' : 'Mark item as done'
                      }
                      aria-pressed={checked}
                    >
                      {checked ? '✓' : ''}
                    </button>
                    <span className={`pp-mini-tag ${task.itemKind}`}>
                      {task.itemKind === 'video' ? 'VIDEO' : 'DSA'}
                    </span>
                    <span
                      className={`pp-group-task-text ${checked ? 'done' : ''}`}
                    >
                      {text}
                    </span>
                    {link && (
                      <a
                        href={link}
                        className="pp-task-link-btn"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {getTaskActionLabel(task, 'dsaSheet')} ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Today panel ─────────────────────────────────────────────────────────────

function TodayPanel({
  weeks,
  statuses,
  onStatusChange,
  onQuickDone,
  itemChecks,
  onToggleItem,
}) {
  const today = startOfToday();

  const entry = useMemo(() => {
    // First try exact today match
    for (const week of weeks || []) {
      for (const day of week.days || []) {
        const ts = parseDateToTimestamp(day.date, day.isoDate);
        if (ts !== null && ts === today) {
          return {
            day,
            key: `${week.id}-${dayKeyFromDateText(day.date)}`,
            week,
          };
        }
      }
    }
    // Fallback: first pending day
    for (const week of weeks || []) {
      for (const day of week.days || []) {
        const key = `${week.id}-${dayKeyFromDateText(day.date)}`;
        if ((statuses[key] || 'todo') !== 'done') {
          return { day, key, week };
        }
      }
    }
    return null;
  }, [weeks, statuses, today]);

  if (!entry) {
    return (
      <div className="pp-today">
        <div className="pp-today-empty">
          🎉 All caught up — no pending tasks.
        </div>
      </div>
    );
  }

  const { day, key, week } = entry;
  const status = statuses[key] || 'todo';
  const ts = parseDateToTimestamp(day.date, day.isoDate);
  const isOverdue = ts !== null && ts < today && status !== 'done';
  const displayStatus = isOverdue ? 'overdue' : status;
  const tasks = splitTasks(day);
  const dayItemKeys = getAllDayTaskItemKeys(day, key);

  const statusLabels = {
    overdue: 'Overdue',
    todo: 'Up next',
    review: 'In Review',
    done: 'Done',
  };

  return (
    <div className="pp-today">
      <div className="pp-today-header">
        <div>
          <p className="pp-today-eyebrow">Week {week.num} · Focus now</p>
          <h2 className="pp-today-title">
            {day.date} — {day.name}
          </h2>
          <div className="pp-today-chips">
            <span className="pp-chip pp-chip-hrs">{day.hours}h</span>
            <span className={`pp-chip pp-chip-${displayStatus}`}>
              {statusLabels[displayStatus]}
            </span>
          </div>
        </div>
      </div>

      <div className="pp-groups">
        <VideoDsaGroup
          groups={tasks.videoDsaGroups}
          dayKey={key}
          dayItemKeys={dayItemKeys}
          itemChecks={itemChecks}
          onToggleItem={onToggleItem}
          defaultOpen={true}
        />
        <TaskGroup
          dot="bix"
          label="IndiaBix Aptitude"
          items={tasks.indiabix}
          dayKey={key}
          bucket="indiabix"
          defaultOpen={!tasks.videoDsaGroups.length}
          dayItemKeys={dayItemKeys}
          itemChecks={itemChecks}
          onToggleItem={onToggleItem}
        />
        <TaskGroup
          dot="rev"
          label="Revision"
          items={tasks.revision}
          dayKey={key}
          bucket="extras"
          defaultOpen={false}
          dayItemKeys={dayItemKeys}
          itemChecks={itemChecks}
          onToggleItem={onToggleItem}
        />
        <TaskGroup
          dot="other"
          label="Other"
          items={tasks.extras}
          dayKey={key}
          bucket="extras"
          defaultOpen={false}
          dayItemKeys={dayItemKeys}
          itemChecks={itemChecks}
          onToggleItem={onToggleItem}
        />
      </div>

      <div className="pp-today-footer">
        <select
          value={status}
          onChange={(e) => onStatusChange(key, e.target.value, dayItemKeys)}
          className="pp-status-sel"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-green"
          onClick={() => onQuickDone(key, dayItemKeys)}
          disabled={status === 'done'}
        >
          {status === 'done' ? '✓ Completed' : 'Mark Complete'}
        </button>
      </div>
    </div>
  );
}

// ─── Day row (inside expanded week) ──────────────────────────────────────────

function DayRow({
  day,
  weekId,
  statuses,
  onStatusChange,
  onQuickDone,
  itemChecks,
  onToggleItem,
}) {
  const [expanded, setExpanded] = useState(false);
  const key = `${weekId}-${dayKeyFromDateText(day.date)}`;
  const status = statuses[key] || 'todo';
  const ts = parseDateToTimestamp(day.date, day.isoDate);
  const isOverdue = ts !== null && ts < startOfToday() && status !== 'done';
  const dotClass = isOverdue ? 'overdue' : status;

  const tasks = splitTasks(day);
  const dayItemKeys = getAllDayTaskItemKeys(day, key);
  const allTasks = [
    ...tasks.videoDsaGroups.flatMap((group) => group.items),
    ...tasks.indiabix,
    ...tasks.revision,
    ...tasks.extras,
  ];

  const preview = allTasks
    .slice(0, 3)
    .map((t) => t.text)
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div
        className="pp-day-row"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`pp-day-dot ${dotClass}`} />
        <div className="pp-day-info">
          <p className="pp-day-name">
            {day.date} · {day.name}
          </p>
          {!expanded && (
            <p className="pp-day-preview">{preview || 'No tasks listed'}</p>
          )}
        </div>
        <span className="pp-day-hours-txt">{day.hours}h</span>

        {/* Stop propagation so clicks on controls don't toggle expansion */}
        <div className="pp-day-actions" onClick={(e) => e.stopPropagation()}>
          <select
            value={status}
            onChange={(e) => onStatusChange(key, e.target.value, dayItemKeys)}
            className="pp-inline-sel"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            style={
              status !== 'done'
                ? {
                    background: 'var(--green-bg)',
                    color: 'var(--green-txt)',
                    borderColor: 'rgba(22,163,74,0.2)',
                  }
                : { opacity: 0.5 }
            }
            onClick={() => onQuickDone(key, dayItemKeys)}
            disabled={status === 'done'}
          >
            {status === 'done' ? '✓' : 'Done'}
          </button>
        </div>

        <span
          className={`pp-week-arrow ${expanded ? 'open' : ''}`}
          aria-hidden="true"
          style={{ marginLeft: 4 }}
        >
          ▼
        </span>
      </div>

      {expanded && allTasks.length > 0 && (
        <div className="pp-day-expanded">
          {tasks.videoDsaGroups.map((group) => (
            <div key={`${key}-${group.id}`} className="pp-exp-video">
              <p className="pp-exp-video-title">{group.title}</p>
              {group.items.map((task, i) => {
                const text = String(task?.text || '').trim();
                const link = String(task?.link || '').trim();
                const itemKey = getTaskItemKey(key, task);
                const checked = Boolean(itemChecks?.[itemKey]);
                return (
                  <div key={`${key}-${group.id}-${i}`} className="pp-exp-task">
                    <button
                      type="button"
                      className={`pp-item-check ${checked ? 'done' : ''}`}
                      onClick={() => onToggleItem?.(key, itemKey, dayItemKeys)}
                      aria-label={
                        checked ? 'Mark item as pending' : 'Mark item as done'
                      }
                      aria-pressed={checked}
                    >
                      {checked ? '✓' : ''}
                    </button>
                    <span className={`pp-mini-tag ${task.itemKind}`}>
                      {task.itemKind === 'video' ? 'VIDEO' : 'DSA'}
                    </span>
                    <span className={`pp-exp-text ${checked ? 'done' : ''}`}>
                      {text}
                    </span>
                    {link && (
                      <a
                        href={link}
                        className="pp-exp-link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {getTaskActionLabel(task, 'dsaSheet')} ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {[...tasks.indiabix, ...tasks.revision, ...tasks.extras].map(
            (task, i) => {
              const text = String(task?.text || '').trim();
              const link = String(task?.link || '').trim();
              const itemKey = getTaskItemKey(key, task);
              const checked = Boolean(itemChecks?.[itemKey]);
              let cat = 'etc';
              const rawCat = String(task?.cat || '').toUpperCase();
              if (rawCat === 'APT') cat = 'apt';
              else if (rawCat === 'REV') cat = 'rev';
              return (
                <div key={`${key}-other-${i}`} className="pp-exp-task">
                  <button
                    type="button"
                    className={`pp-item-check ${checked ? 'done' : ''}`}
                    onClick={() => onToggleItem?.(key, itemKey, dayItemKeys)}
                    aria-label={
                      checked ? 'Mark item as pending' : 'Mark item as done'
                    }
                    aria-pressed={checked}
                  >
                    {checked ? '✓' : ''}
                  </button>
                  <span className={`pp-mini-tag ${cat}`}>
                    {cat === 'apt' ? 'APT' : cat === 'rev' ? 'REV' : 'ETC'}
                  </span>
                  <span className={`pp-exp-text ${checked ? 'done' : ''}`}>
                    {text}
                  </span>
                  {link && (
                    <a
                      href={link}
                      className="pp-exp-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {getTaskActionLabel(
                        task,
                        cat === 'apt' ? 'indiabix' : 'extras',
                      )}{' '}
                      ↗
                    </a>
                  )}
                </div>
              );
            },
          )}
        </div>
      )}
    </>
  );
}

// ─── Week accordion ───────────────────────────────────────────────────────────

function WeekRow({
  week,
  statuses,
  onStatusChange,
  onQuickDone,
  itemChecks,
  onToggleItem,
}) {
  const [open, setOpen] = useState(false);
  const stats = calculateWeekStats(week, statuses);
  const today = startOfToday();

  const overdueCount = (week.days || []).filter((day) => {
    const key = `${week.id}-${dayKeyFromDateText(day.date)}`;
    const ts = parseDateToTimestamp(day.date, day.isoDate);
    return ts !== null && ts < today && (statuses[key] || 'todo') !== 'done';
  }).length;

  return (
    <article className="pp-week">
      <button
        type="button"
        className="pp-week-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Ring percent={stats.percent} />
        <div className="pp-week-info">
          <p className="pp-week-name">
            {week.milestone?.icon ? `${week.milestone.icon} ` : ''}Week{' '}
            {week.num}: {week.title}
          </p>
          <p className="pp-week-date">{week.dateRange}</p>
        </div>
        <div className="pp-week-meta">
          {overdueCount > 0 && (
            <span className="pp-badge pp-badge-overdue">
              {overdueCount} late
            </span>
          )}
          <span className="pp-badge pp-badge-done">
            {stats.done}/{stats.total}
          </span>
          {week.phase && (
            <span className="pp-badge pp-badge-phase">
              {String(week.phase).toUpperCase()}
            </span>
          )}
        </div>
        <span
          className={`pp-week-arrow ${open ? 'open' : ''}`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="pp-week-body">
          {week.milestone?.title && (
            <div className="pp-milestone">
              🏁 <strong>{week.milestone.title}</strong>
              {week.milestone.sub && (
                <span style={{ opacity: 0.7, fontWeight: 400 }}>
                  {' '}
                  — {week.milestone.sub}
                </span>
              )}
            </div>
          )}
          {(week.days || []).map((day) => (
            <DayRow
              key={`${week.id}-${dayKeyFromDateText(day.date)}`}
              day={day}
              weekId={week.id}
              statuses={statuses}
              onStatusChange={onStatusChange}
              onQuickDone={onQuickDone}
              itemChecks={itemChecks}
              onToggleItem={onToggleItem}
            />
          ))}
        </div>
      )}
    </article>
  );
}

// ─── Setup modal ──────────────────────────────────────────────────────────────

function SetupModal({
  open,
  settings,
  meta,
  saving,
  onChange,
  onClose,
  onSave,
}) {
  if (!open) return null;
  return (
    <div className="pp-backdrop" role="dialog" aria-modal="true">
      <section className="pp-modal">
        <div className="pp-modal-head">
          <h2 className="pp-modal-title">Configure planner</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={saving}
          >
            ✕
          </button>
        </div>
        <div className="pp-modal-body">
          <p className="pp-modal-desc">
            Set your starting point once. Tasks will automatically align to your
            current video, DSA topic, and aptitude level.
          </p>
          <div className="pp-field">
            <label className="pp-field-lbl">Starting date</label>
            <input
              type="date"
              className="pp-field-input"
              value={settings.startDate}
              onChange={(e) =>
                onChange({ ...settings, startDate: e.target.value })
              }
              disabled={saving}
            />
          </div>
          <div className="pp-field">
            <label className="pp-field-lbl">Current YouTube video</label>
            <select
              className="pp-field-sel"
              value={String(settings.startVideoPosition)}
              onChange={(e) =>
                onChange({
                  ...settings,
                  startVideoPosition: Number.parseInt(e.target.value, 10),
                })
              }
              disabled={saving}
            >
              {(meta?.videos || []).map((v) => (
                <option key={v.id} value={v.position}>
                  #{v.position} — {v.title}
                </option>
              ))}
            </select>
          </div>
          <div className="pp-field">
            <label className="pp-field-lbl">
              DSA topic override (optional)
            </label>
            <select
              className="pp-field-sel"
              value={settings.startDsaTopicId || ''}
              onChange={(e) =>
                onChange({ ...settings, startDsaTopicId: e.target.value })
              }
              disabled={saving}
            >
              <option value="">Auto from video</option>
              {(meta?.dsaTopics || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.step} — {t.topic}
                  {t.linkedVideoPosition ? ` (#${t.linkedVideoPosition})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="pp-field">
            <label className="pp-field-lbl">Aptitude starting topic</label>
            <select
              className="pp-field-sel"
              value={settings.startAptitudeId || 'none'}
              onChange={(e) =>
                onChange({
                  ...settings,
                  startAptitudeId:
                    e.target.value === 'none' ? '' : e.target.value,
                })
              }
              disabled={saving}
            >
              <option value="none">From beginning</option>
              {(meta?.aptitudeTopics || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.topic} ({t.questionCount}Q)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="pp-modal-foot">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-solid"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save & Regenerate'}
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function DashboardClient() {
  const router = useRouter();
  const [planner, setPlanner] = useState(null);
  const [plannerMeta, setPlannerMeta] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [plannerSettings, setPlannerSettings] = useState(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState(DEFAULT_SETTINGS);
  const [setupOpen, setSetupOpen] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [itemChecks, setItemChecks] = useState({});
  const [theme, setTheme] = useState('dark');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') setTheme(saved);

    const savedChecks = localStorage.getItem(ITEM_CHECKS_STORAGE_KEY);
    if (savedChecks) {
      try {
        const parsed = JSON.parse(savedChecks);
        if (parsed && typeof parsed === 'object') {
          setItemChecks(parsed);
        }
      } catch {
        // Ignore malformed local data.
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(ITEM_CHECKS_STORAGE_KEY, JSON.stringify(itemChecks));
  }, [itemChecks]);

  async function loadDashboardData() {
    const progressRes = await fetch('/api/progress');
    if (!progressRes.ok) {
      const p = await progressRes.json().catch(() => ({}));
      throw new Error(p?.error || 'Failed to load progress data');
    }
    const progressData = await progressRes.json();
    const mergedSettings = normalizePlannerSettings(
      progressData?.settings || {},
    );
    const plannerRes = await fetch(
      `/api/planner?${buildPlannerQuery(mergedSettings)}`,
    );
    if (!plannerRes.ok) {
      const p = await plannerRes.json().catch(() => ({}));
      throw new Error(p?.error || 'Failed to load planner data');
    }
    const plannerData = await plannerRes.json();
    return {
      statuses: progressData.statuses || {},
      settings: mergedSettings,
      plannerData,
    };
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const payload = await loadDashboardData();
        if (!mounted) return;
        setPlanner(payload.plannerData);
        setPlannerMeta(payload.plannerData.meta || null);
        setStatuses(payload.statuses);
        setPlannerSettings(payload.settings);
        setDraftSettings(payload.settings);
      } catch (e) {
        if (mounted) setError(e.message || 'Failed to load dashboard.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    const vals = Object.values(statuses);
    return {
      todo: vals.filter((v) => v === 'todo').length,
      review: vals.filter((v) => v === 'review').length,
      done: vals.filter((v) => v === 'done').length,
    };
  }, [statuses]);

  const bestStreak = useMemo(
    () => calculateBestDoneStreak(planner?.weeks || [], statuses),
    [planner, statuses],
  );

  const filterOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All weeks' }];
    for (const w of planner?.weeks || []) {
      opts.push({ value: `week:${w.id}`, label: `Week ${w.num}: ${w.title}` });
    }
    return opts;
  }, [planner]);

  const filteredWeeks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (planner?.weeks || [])
      .filter((w) => scopeFilter === 'all' || scopeFilter === `week:${w.id}`)
      .map((w) => ({
        ...w,
        days: (w.days || []).filter((day) => {
          const key = `${w.id}-${dayKeyFromDateText(day.date)}`;
          const st = statuses[key] || 'todo';
          if (statusFilter !== 'all' && st !== statusFilter) return false;
          if (!q) return true;
          const joined = (day.tasks || [])
            .map((t) => `${t.cat || ''} ${t.text || ''}`)
            .join(' ')
            .toLowerCase();
          return `${day.name} ${day.date} ${joined}`.toLowerCase().includes(q);
        }),
      }))
      .filter((w) => w.days.length > 0);
  }, [planner, searchQuery, scopeFilter, statusFilter, statuses]);

  function setItemCompletionForDay(dayItemKeys, done) {
    if (!Array.isArray(dayItemKeys) || dayItemKeys.length === 0) return;
    setItemChecks((cur) => {
      const next = { ...cur };
      for (const taskKey of dayItemKeys) {
        next[taskKey] = done;
      }
      return next;
    });
  }

  async function setStatus(dayKey, nextStatus, dayItemKeys = []) {
    const prev = statuses[dayKey];
    setStatuses((cur) => ({ ...cur, [dayKey]: nextStatus }));

    if (dayItemKeys.length > 0) {
      setItemCompletionForDay(dayItemKeys, nextStatus === 'done');
    }

    try {
      const res = await fetch('/api/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayKey, status: nextStatus }),
      });
      const p = await res.json();
      if (!res.ok) throw new Error(p?.error || 'Save failed');
    } catch (e) {
      setStatuses((cur) => ({ ...cur, [dayKey]: prev || 'todo' }));
      if (dayItemKeys.length > 0) {
        setItemCompletionForDay(dayItemKeys, (prev || 'todo') === 'done');
      }
      setError(e.message || 'Unable to save progress');
    }
  }

  function setDoneQuick(dayKey, dayItemKeys = []) {
    setStatus(dayKey, 'done', dayItemKeys);
  }

  function toggleTaskItemDone(dayKey, itemKey, dayItemKeys = []) {
    const currentDayStatus = statuses[dayKey] || 'todo';
    const nextChecks = { ...itemChecks, [itemKey]: !itemChecks[itemKey] };
    setItemChecks(nextChecks);

    if (dayItemKeys.length > 0) {
      const everyDone = dayItemKeys.every((k) => Boolean(nextChecks[k]));
      if (everyDone && currentDayStatus !== 'done') {
        setStatus(dayKey, 'done', []);
      } else if (!everyDone && currentDayStatus === 'done') {
        setStatus(dayKey, 'todo', []);
      }
    }
  }
  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  function openSetup() {
    setDraftSettings(plannerSettings);
    setSetupOpen(true);
  }

  async function saveSetup() {
    setSavingSetup(true);
    setError('');
    try {
      const normalized = normalizePlannerSettings(draftSettings);
      const res = await fetch('/api/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Save failed');

      const plannerRes = await fetch(
        `/api/planner?${buildPlannerQuery(payload.settings || normalized)}`,
      );
      const pp = await plannerRes.json();
      if (!plannerRes.ok) throw new Error(pp?.error || 'Regeneration failed');

      setPlanner(pp);
      setPlannerMeta(pp.meta || null);
      const s = normalizePlannerSettings(payload.settings || normalized);
      setPlannerSettings(s);
      setDraftSettings(s);
      setSetupOpen(false);
    } catch (e) {
      setError(e.message || 'Unable to save settings');
    } finally {
      setSavingSetup(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="pp-loading">
        <div className="pp-spinner" />
        <span>Loading your planner…</span>
      </div>
    );
  }

  if (error && !planner) {
    return (
      <div className="pp-loading">
        <div className="pp-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="pp">
      {/* ─ Nav ─ */}
      <nav className="pp-nav">
        <div className="pp-brand">
          <div className="pp-brand-icon">
            <LayoutDashboard size={14} strokeWidth={2.5} />
          </div>
          <span className="pp-brand-name">Placement Planner</span>
        </div>

        <div className="pp-nav-gap" />

        <a
          href="https://github.com/sujaldef"
          className="pp-social-link"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
        >
          <GitHubIcon width="14" height="14" />
        </a>
        <a
          href="https://www.linkedin.com/in/sujalkoshta"
          className="pp-social-link"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LinkedIn"
        >
          <LinkedInIcon width="14" height="14" />
        </a>

        <div className="pp-nav-divider" />

        <div className="pp-nav-right">
          <button
            onClick={toggleTheme}
            className="btn btn-ghost"
            type="button"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀ Light' : '◑ Dark'}
          </button>
          <button onClick={logout} className="btn btn-danger" type="button">
            Logout
          </button>
        </div>
      </nav>

      <SetupModal
        open={setupOpen}
        settings={draftSettings}
        meta={plannerMeta}
        saving={savingSetup}
        onChange={(n) => setDraftSettings(normalizePlannerSettings(n))}
        onClose={() => setSetupOpen(false)}
        onSave={saveSetup}
      />

      <main className="pp-main">
        {/* Stats */}
        <div className="pp-stats">
          <div className="pp-stat">
            <p className="pp-stat-lbl">Done</p>
            <p className="pp-stat-val green">{totals.done}</p>
          </div>
          <div className="pp-stat">
            <p className="pp-stat-lbl">Review</p>
            <p className="pp-stat-val amber">{totals.review}</p>
          </div>
          <div className="pp-stat">
            <p className="pp-stat-lbl">Remaining</p>
            <p className="pp-stat-val">{totals.todo}</p>
          </div>
          <div className="pp-stat">
            <p className="pp-stat-lbl">Best Streak</p>
            <p className="pp-stat-val accent">
              {bestStreak}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: 'var(--text-3)',
                }}
              >
                d
              </span>
            </p>
          </div>
        </div>

        {error && (
          <div className="pp-error" role="alert">
            ⚠ {error}
          </div>
        )}

        {/* Today focus */}
        <div>
          <div className="pp-section-head">
            <h2 className="pp-section-title">Today's Focus</h2>
            <span className="pp-section-meta">Your next action</span>
          </div>
          <TodayPanel
            weeks={planner?.weeks || []}
            statuses={statuses}
            onStatusChange={setStatus}
            onQuickDone={setDoneQuick}
            itemChecks={itemChecks}
            onToggleItem={toggleTaskItemDone}
          />
        </div>

        {/* Full schedule */}
        <div>
          <div className="pp-section-head">
            <h2 className="pp-section-title">Full Schedule</h2>
            <div className="pp-section-actions">
              <span className="pp-section-meta">
                {filteredWeeks.length} week
                {filteredWeeks.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={openSetup}
                className="btn btn-ghost btn-sm"
                type="button"
              >
                ⚙ Configure
              </button>
            </div>
          </div>

          <div className="pp-filters">
            <input
              className="pp-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, dates…"
            />
            <select
              className="pp-sel"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="todo">Todo</option>
              <option value="review">In review</option>
              <option value="done">Done</option>
            </select>
            <select
              className="pp-sel"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
            >
              {filterOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pp-weeks">
            {filteredWeeks.length === 0 ? (
              <div className="pp-empty">
                <p className="pp-empty-ico">🔍</p>
                <p className="pp-empty-title">No results</p>
                <p className="pp-empty-sub">
                  Try clearing your filters or search query.
                </p>
              </div>
            ) : (
              filteredWeeks.map((week) => (
                <WeekRow
                  key={week.id}
                  week={week}
                  statuses={statuses}
                  onStatusChange={setStatus}
                  onQuickDone={setDoneQuick}
                  itemChecks={itemChecks}
                  onToggleItem={toggleTaskItemDone}
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
