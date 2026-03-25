import fs from 'fs';
import path from 'path';
import vm from 'vm';

let cachedPlanner = null;

const RESOURCE_LINKS = {
  videos:
    'https://www.youtube.com/playlist?list=PLgUwDviBIf0oF6QL8m22w1hIDC1vJ_BHz',
  dsaSheet: 'https://bugaddr.github.io/a2z_old_sheet/',
  indiabix: 'https://www.indiabix.com/',
};

function normalizeTask(task) {
  if (!task || typeof task !== 'object') {
    return task;
  }

  const taskLink = getTaskLink(task);

  return {
    ...task,
    ...(taskLink ? taskLink : {}),
  };
}

export function getTaskLink(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  const existingLink = String(task.link || '').trim();
  const existingLabel = String(task.linkLabel || '').trim();
  if (existingLink) {
    return {
      link: existingLink,
      ...(existingLabel ? { linkLabel: existingLabel } : {}),
    };
  }

  const cat = String(task.cat || '').toUpperCase();
  const text = String(task.text || '');

  if (cat === 'DSA' && /\bvideos?\b/i.test(text)) {
    return {
      link: RESOURCE_LINKS.videos,
      linkLabel: 'Watch',
    };
  }

  if (cat === 'DSA' && /\bproblems?\b/i.test(text)) {
    return {
      link: RESOURCE_LINKS.dsaSheet,
      linkLabel: 'Solve',
    };
  }

  if (cat === 'APT' || /\bindiabix\b/i.test(text)) {
    return {
      link: RESOURCE_LINKS.indiabix,
      linkLabel: 'Practice',
    };
  }

  return null;
}

function normalizePlannerData(planner) {
  if (!planner || typeof planner !== 'object') {
    return planner;
  }

  return {
    ...planner,
    weeks: (planner.weeks || []).map((week) => ({
      ...week,
      days: (week.days || []).map((day) => ({
        ...day,
        tasks: (day.tasks || []).map(normalizeTask),
      })),
    })),
  };
}

export function getPlannerData() {
  if (cachedPlanner) {
    return cachedPlanner;
  }

  const plannerPath = path.join(process.cwd(), 'planner-data.js');
  const source = fs.readFileSync(plannerPath, 'utf8');
  const sandbox = { window: {} };

  vm.runInNewContext(source, sandbox, { filename: 'planner-data.js' });

  if (!sandbox.window || !sandbox.window.PLANNER_DATA) {
    throw new Error('Failed to load planner data from planner-data.js');
  }

  cachedPlanner = normalizePlannerData(sandbox.window.PLANNER_DATA);
  return cachedPlanner;
}
