export function formatSql(sql) {
  return sql.replace(/\r\n?/g, "\n").trim();
}

export function extractSql(response) {
  const value = response?.value;
  const sql = typeof value === "string" ? value : value?.data?.[0]?.sql;
  if (typeof sql !== "string") {
    throw new Error("解释接口返回中未找到 data[0].sql。");
  }

  const formattedSql = formatSql(sql);
  if (!formattedSql) throw new Error("解释接口返回了空 SQL。");
  return formattedSql;
}
