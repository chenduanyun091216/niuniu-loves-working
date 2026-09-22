function isTableRow(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tableCandidateScore(rows, depth) {
  const columns = new Set(rows.flatMap((row) => Object.keys(row)));
  if (!columns.size) return -Infinity;

  const populatedRows = rows.filter((row) => Object.keys(row).length > 0).length;
  const averageColumns = rows.reduce((total, row) => total + Object.keys(row).length, 0) / rows.length;
  return rows.length * 10 + columns.size * 2 + populatedRows + averageColumns - depth;
}

export function findTabularData(value, path = "$", depth = 0, best = null) {
  if (depth > 16 || value === null || typeof value !== "object") return best;

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isTableRow)) {
      const score = tableCandidateScore(value, depth);
      if (Number.isFinite(score) && (!best || score > best.score)) best = { path, rows: value, score };
    }
    for (const [index, child] of value.entries()) {
      best = findTabularData(child, `${path}[${index}]`, depth + 1, best);
    }
    return best;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
    best = findTabularData(child, childPath, depth + 1, best);
  }
  return best;
}

export function formatTableCell(value) {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
