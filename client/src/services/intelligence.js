const numberOr = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function buildIrrigationInsights(schemes = [], telemetry = {}) {
  const insights = [];

  for (const scheme of schemes) {
    const equipped = numberOr(scheme.equipped_area);
    const functional = numberOr(scheme.functional_area);
    const gap = Math.max(0, equipped - functional);
    const gapRate = equipped ? gap / equipped : 0;

    if (gap > 0 && (gapRate >= 0.35 || scheme.status !== 'Functional')) {
      insights.push({
        id: `scheme-${scheme.id}`,
        priority: gapRate >= 0.5 || scheme.status !== 'Functional' ? 'High' : 'Medium',
        category: 'Scheme performance',
        title: `${scheme.name} has ${Math.round(gap).toLocaleString()} ha out of service`,
        detail: `${Math.round(gapRate * 100)}% of equipped area is not currently functional in ${scheme.district}.`,
        action: 'Inspect canals, pumps and distribution points; record the cause of lost service area.',
        schemeId: scheme.id,
      });
    }
  }

  const moisture = numberOr(telemetry.soil_moisture, null);
  const rainRisk = numberOr(telemetry.rain_risk, null);
  const flow = numberOr(telemetry.water_flow, null);
  if (moisture !== null && moisture < 35) {
    insights.push({
      id: 'low-moisture', priority: moisture < 25 ? 'High' : 'Medium', category: 'Water management',
      title: 'Soil moisture is below the planning threshold',
      detail: `The reported average is ${moisture}%. Check crop stage and confirm the reading at field level.`,
      action: 'Review the next irrigation rotation and verify sensor calibration before changing allocations.',
    });
  }
  if (rainRisk !== null && rainRisk >= 70) {
    insights.push({
      id: 'rain-risk', priority: rainRisk >= 85 ? 'High' : 'Medium', category: 'Weather response',
      title: 'Rainfall may reduce near-term irrigation demand',
      detail: `Reported 24-hour rain risk is ${rainRisk}%.`,
      action: 'Check the local forecast and consider deferring non-critical irrigation after field confirmation.',
    });
  }
  if (flow !== null && flow <= 0) {
    insights.push({
      id: 'flow-zero', priority: 'High', category: 'Telemetry alert',
      title: 'Water flow is zero or unavailable',
      detail: 'A zero reading can indicate an interruption or a sensor issue.',
      action: 'Verify the meter and pump status, then confirm whether the reading is current.',
    });
  }

  const order = { High: 0, Medium: 1, Low: 2 };
  insights.sort((a, b) => order[a.priority] - order[b.priority]);
  if (!insights.length) {
    insights.push({
      id: 'steady-state', priority: 'Low', category: 'Portfolio status',
      title: 'No immediate operational flags from available data',
      detail: 'Current scheme records and reported telemetry do not cross the configured alert thresholds.',
      action: 'Keep scheme records and field readings current to improve future recommendations.',
    });
  }
  return insights;
}
