import fs from 'fs';
import path from 'path';
import vm from 'vm';

let cachedPlanner = null;

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

  cachedPlanner = sandbox.window.PLANNER_DATA;
  return cachedPlanner;
}
