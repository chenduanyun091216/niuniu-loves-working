import { formatTableCell } from "./table-utils.js";
import { createNote, highlightResponseMatches } from "./panel-views.js";

const tableCellDialog = document.getElementById("table-cell-dialog");
const tableCellValue = document.getElementById("table-cell-value");

function addTableColumnResizer(header) {
  const resizer = document.createElement("span");
  resizer.className = "table-column-resizer";
  resizer.tabIndex = 0;
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-label", `调整 ${header.textContent} 列宽`);

  const setWidth = (width) => {
    const nextWidth = Math.max(72, Math.round(width));
    header.style.width = `${nextWidth}px`;
    header.style.minWidth = `${nextWidth}px`;
    resizer.setAttribute("aria-valuenow", String(nextWidth));
  };
  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("is-table-resizing");
    resizer.dataset.startX = String(event.clientX);
    resizer.dataset.startWidth = String(header.getBoundingClientRect().width);
    event.preventDefault();
  });
  resizer.addEventListener("pointermove", (event) => {
    if (!resizer.hasPointerCapture(event.pointerId)) return;
    setWidth(Number(resizer.dataset.startWidth) + event.clientX - Number(resizer.dataset.startX));
  });
  const finishResize = () => document.body.classList.remove("is-table-resizing");
  resizer.addEventListener("pointerup", finishResize);
  resizer.addEventListener("pointercancel", finishResize);
  resizer.addEventListener("lostpointercapture", finishResize);
  resizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setWidth(header.getBoundingClientRect().width + (event.key === "ArrowLeft" ? -12 : 12));
  });
  header.append(resizer);
}

function createTableCell(value) {
  const cell = document.createElement("td");
  const text = formatTableCell(value);
  if (text.length <= 80) {
    cell.textContent = text;
    return cell;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "table-cell-preview";
  button.textContent = text;
  button.title = "查看完整内容";
  button.addEventListener("click", () => {
    tableCellValue.textContent = text;
    tableCellDialog.showModal();
  });
  cell.append(button);
  return cell;
}

export function renderTableTab(detailContent, tableData, responseSearchTerm) {
  if (!tableData) {
    detailContent.append(createNote("此接口没有可展示为表格的字典列表"));
    return;
  }

  const columns = [];
  const columnSet = new Set();
  for (const row of tableData.rows) {
    for (const key of Object.keys(row)) {
      if (!columnSet.has(key)) {
        columnSet.add(key);
        columns.push(key);
      }
    }
  }

  const summary = document.createElement("div");
  summary.className = "table-summary";
  summary.textContent = `${tableData.path} · ${tableData.rows.length} 条`;

  if (!columns.length) {
    detailContent.append(summary);
    detailContent.append(createNote("列表中的对象没有可展示字段"));
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const indexHeader = document.createElement("th");
  indexHeader.className = "table-index";
  indexHeader.scope = "col";
  indexHeader.textContent = "序号";
  addTableColumnResizer(indexHeader);
  headerRow.append(indexHeader);
  for (const column of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column;
    addTableColumnResizer(cell);
    headerRow.append(cell);
  }
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  for (const [index, row] of tableData.rows.entries()) {
    const tableRow = document.createElement("tr");
    const indexCell = document.createElement("td");
    indexCell.className = "table-index";
    indexCell.textContent = String(index + 1);
    tableRow.append(indexCell);
    for (const column of columns) {
      tableRow.append(createTableCell(Object.hasOwn(row, column) ? row[column] : undefined));
    }
    tbody.append(tableRow);
  }

  table.append(thead, tbody);
  detailContent.append(table, summary);
  return highlightResponseMatches(table, responseSearchTerm);
}
