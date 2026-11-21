import { describe, expect, it } from 'vitest';
import { EXPECTED_KEYS } from '../../../Backend/src/tests/roles/expectedAccess.js';
import { REPORT_FEATURES as GUARD_REPORT_FEATURES } from '../lib/tenantGuards.js';
import { featureKeys, guardForPath } from '../lib/canSeeRoute.js';
import {
  REPORT_FEATURES,
  findTutorialScenario,
  resolveRoute,
  sectionsForUser,
  tutorialSections,
} from './tutorial-data.js';

function allScenarios() {
  return tutorialSections.flatMap((section) => section.scenarios);
}

function scenarioIds(sections) {
  return sections.flatMap((section) => section.scenarios.map((s) => s.id)).sort();
}

function firstConcreteRoute(scenario) {
  for (const item of scenario.steps || []) {
    const route = resolveRoute(item.route, { role: 'Owner' });
    if (route && typeof route === 'string') return route;
  }
  return '';
}

function sameFeatureSet(a, b) {
  const left = new Set(featureKeys(a));
  const right = new Set(featureKeys(b));
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
}

describe('tutorial guide plan gating', () => {
  it('reuses the same REPORT_FEATURES list as tenant route guards', () => {
    expect(REPORT_FEATURES).toEqual(GUARD_REPORT_FEATURES);
  });

  it('sets scenario feature to match the plan gate of its first concrete route', () => {
    const mismatches = [];
    for (const scenario of allScenarios()) {
      const route = firstConcreteRoute(scenario);
      if (!route) continue;
      const guard = guardForPath(route);
      if (!guard?.feature) continue;

      // Scenario-level gate is preferred. Step-level feature on every step for
      // that route is also fine (e.g. WhatsApp steps inside Your account).
      if (sameFeatureSet(scenario.feature, guard.feature)) continue;

      const routedSteps = (scenario.steps || []).filter((item) => {
        const stepRoute = resolveRoute(item.route, { role: 'Owner' });
        return stepRoute && guardForPath(stepRoute)?.path === guard.path;
      });
      const stepGated = routedSteps.length > 0
        && routedSteps.every((item) => sameFeatureSet(item.feature, guard.feature));
      if (stepGated) continue;

      mismatches.push({
        id: scenario.id,
        route,
        scenarioFeature: scenario.feature ?? null,
        guardFeature: guard.feature,
      });
    }
    expect(mismatches).toEqual([]);
  });

  it('hides retail, maintenance, and sales guides when those plan features are off', () => {
    const user = { role: 'Owner', access: EXPECTED_KEYS.Owner };
    const blocked = new Set(['retail', 'maintenance', 'sales_crm']);
    const hasFeature = (key) => !blocked.has(key);
    const ids = scenarioIds(sectionsForUser(user, hasFeature));

    for (const id of ['retail-pos', 'retail-products', 'retail-reports', 'maintenance', 'sales-dashboard', 'my-members']) {
      expect(ids.includes(id), id).toBe(false);
    }
    expect(findTutorialScenario('retail-pos')).toBeTruthy();
    expect(findTutorialScenario('maintenance')).toBeTruthy();
  });

  it('shows retail and maintenance guides when the plan includes them', () => {
    const user = { role: 'Owner', access: EXPECTED_KEYS.Owner };
    const hasFeature = () => true;
    const ids = scenarioIds(sectionsForUser(user, hasFeature));
    expect(ids).toEqual(expect.arrayContaining(['retail-pos', 'retail-products', 'retail-reports', 'maintenance']));
  });
});
