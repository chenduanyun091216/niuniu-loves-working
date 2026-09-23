import { DEFAULT_AES_KEY, DEFAULT_ENCRYPTION_METHOD, getEncryptionMethod } from "./crypto.js";
import { DEFAULT_SQL_BLOCKED_MARKERS, parseSqlBlockedMarkers } from "./sql-utils.js";

const AES_KEY_STORAGE_KEY = "niuniu-aes-key";
const ENCRYPTION_METHOD_STORAGE_KEY = "niuniu-encryption-method";
const THEME_STORAGE_KEY = "niuniu-theme";
const SQL_BLOCKED_MARKERS_STORAGE_KEY = "niuniu-sql-blocked-markers";
const PROFESSIONAL_LIST_MODE_STORAGE_KEY = "niuniu-professional-request-list";
const PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY = "niuniu-professional-sidebar-width";
const PROFESSIONAL_LIST_MODE_WIDTH_DELTA = 72;
const topbar = document.querySelector(".topbar");
const workspace = document.querySelector(".workspace");
const requestSidebar = document.querySelector(".request-sidebar");
const resizeDivider = document.getElementById("resize-divider");
const themeToggleButton = document.getElementById("toggle-theme");
const openSettingsButton = document.getElementById("open-settings");
const settingsDialog = document.getElementById("settings-dialog");
const settingsForm = document.getElementById("settings-form");
const settingsMethod = document.getElementById("encryption-method");
const settingsKey = document.getElementById("aes-key");
const requestListModeToggle = document.getElementById("toggle-request-list-mode");
const settingsSqlBlockedMarkers = document.getElementById("sql-blocked-markers");
const settingsHint = document.querySelector(".settings-hint");
const settingsError = document.getElementById("settings-error");
const cancelSettingsButton = document.getElementById("cancel-settings");
const resetDefaultKeyButton = document.getElementById("reset-default-key");

export function configuredAesKey() {
  try {
    return localStorage.getItem(AES_KEY_STORAGE_KEY) || DEFAULT_AES_KEY;
  } catch {
    return DEFAULT_AES_KEY;
  }
}

export function configuredEncryptionMethod() {
  try {
    const savedMethod = localStorage.getItem(ENCRYPTION_METHOD_STORAGE_KEY);
    return getEncryptionMethod(savedMethod || DEFAULT_ENCRYPTION_METHOD).value;
  } catch {
    return DEFAULT_ENCRYPTION_METHOD;
  }
}

export function configuredSqlBlockedMarkers() {
  try {
    const savedMarkers = localStorage.getItem(SQL_BLOCKED_MARKERS_STORAGE_KEY);
    return savedMarkers === null ? [...DEFAULT_SQL_BLOCKED_MARKERS] : parseSqlBlockedMarkers(savedMarkers);
  } catch {
    return [...DEFAULT_SQL_BLOCKED_MARKERS];
  }
}

function updateEncryptionSettings() {
  const config = getEncryptionMethod(settingsMethod.value);
  const requiresKey = config.keyLengths.length > 0;
  settingsKey.disabled = !requiresKey;
  settingsKey.required = requiresKey;
  settingsHint.textContent = requiresKey
    ? `${config.label}：密钥和 SQL 禁止标识只保存在此扩展的本地配置中。密钥 UTF-8 长度需为 ${config.keyLengths.join("、")} 字节。`
    : "Base64 不需要密钥。解密方式和 SQL 禁止标识只保存在此扩展的本地配置中。";
}

function configuredTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  } catch {
    // Fall back to the system theme when local storage is unavailable.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function configuredProfessionalListMode() {
  try {
    return localStorage.getItem(PROFESSIONAL_LIST_MODE_STORAGE_KEY) === "minimal" ? "minimal" : "detailed";
  } catch {
    return "detailed";
  }
}

function updateRequestListModeToggle() {
  const minimal = document.documentElement.dataset.requestListMode === "minimal";
  requestListModeToggle.textContent = minimal ? ">" : "<";
  requestListModeToggle.title = minimal ? "展开 Method、Status、Time" : "收起 Method、Status、Time";
  requestListModeToggle.setAttribute("aria-label", requestListModeToggle.title);
}

function updateThemeToggle() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeToggleButton.title = dark ? "切换到亮色主题" : "切换到暗色主题";
  themeToggleButton.setAttribute("aria-label", themeToggleButton.title);
  themeToggleButton.setAttribute("aria-pressed", String(dark));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.density = "compact";
  document.documentElement.dataset.requestListMode = configuredProfessionalListMode();
  updateRequestListModeToggle();
  updateThemeToggle();
}

function applySidebarWidth(width) {
  const workspaceWidth = workspace.getBoundingClientRect().width;
  const dividerWidth = resizeDivider.getBoundingClientRect().width || 5;
  const maxWidth = Math.max(0, workspaceWidth - 250 - dividerWidth);
  const minWidth = Math.min(180, maxWidth);
  const nextWidth = Math.min(maxWidth, Math.max(minWidth, width));
  workspace.style.setProperty("--sidebar-width", `${Math.round(nextWidth)}px`);
  topbar.style.setProperty("--sidebar-width", `${Math.round(nextWidth)}px`);
  resizeDivider.setAttribute("aria-valuemin", String(Math.round(minWidth)));
  resizeDivider.setAttribute("aria-valuemax", String(Math.round(maxWidth)));
  resizeDivider.setAttribute("aria-valuenow", String(Math.round(nextWidth)));
}

function configuredProfessionalSidebarWidth() {
  try {
    const width = Number(localStorage.getItem(PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(width) && width > 0 ? width : 0;
  } catch {
    return 0;
  }
}

function saveProfessionalSidebarWidth() {
  try {
    localStorage.setItem(PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(requestSidebar.getBoundingClientRect().width)));
  } catch {
    // The resized layout remains available for the current panel session.
  }
}

function resizeSidebarForRequestListMode(previousMode, nextMode) {
  if (previousMode === nextMode) return;
  const direction = nextMode === "minimal" ? -1 : 1;
  applySidebarWidth(requestSidebar.getBoundingClientRect().width + direction * PROFESSIONAL_LIST_MODE_WIDTH_DELTA);
  saveProfessionalSidebarWidth();
}

export function initializeSettings(onChange) {
  resizeDivider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    resizeDivider.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing");
    applySidebarWidth(event.clientX - workspace.getBoundingClientRect().left);
    event.preventDefault();
  });
  resizeDivider.addEventListener("pointermove", (event) => {
    if (!resizeDivider.hasPointerCapture(event.pointerId)) return;
    applySidebarWidth(event.clientX - workspace.getBoundingClientRect().left);
  });
  function finishSidebarResize() {
    document.body.classList.remove("is-resizing");
    saveProfessionalSidebarWidth();
  }

  resizeDivider.addEventListener("pointerup", finishSidebarResize);
  resizeDivider.addEventListener("pointercancel", finishSidebarResize);
  resizeDivider.addEventListener("lostpointercapture", finishSidebarResize);
  resizeDivider.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -16 : 16;
    applySidebarWidth(requestSidebar.getBoundingClientRect().width + direction);
    finishSidebarResize();
  });
  window.addEventListener("resize", () => applySidebarWidth(requestSidebar.getBoundingClientRect().width));
  applySidebarWidth(configuredProfessionalSidebarWidth() || workspace.getBoundingClientRect().width * 0.32);

  themeToggleButton.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The toggle remains usable for the current panel session.
    }
    applyTheme(nextTheme);
    onChange();
  });

  openSettingsButton.addEventListener("click", () => {
    settingsMethod.value = configuredEncryptionMethod();
    settingsKey.value = configuredAesKey();
    settingsSqlBlockedMarkers.value = configuredSqlBlockedMarkers().join("\n");
    updateEncryptionSettings();
    settingsError.hidden = true;
    settingsDialog.showModal();
  });

  settingsMethod.addEventListener("change", () => {
    settingsError.hidden = true;
    updateEncryptionSettings();
  });
  requestListModeToggle.addEventListener("click", () => {
    const previousMode = document.documentElement.dataset.requestListMode;
    const nextMode = document.documentElement.dataset.requestListMode === "minimal" ? "detailed" : "minimal";
    try {
      localStorage.setItem(PROFESSIONAL_LIST_MODE_STORAGE_KEY, nextMode);
    } catch {
      // The toggle remains usable for the current panel session.
    }
    resizeSidebarForRequestListMode(previousMode, nextMode);
    document.documentElement.dataset.requestListMode = nextMode;
    updateRequestListModeToggle();
    onChange();
  });

  cancelSettingsButton.addEventListener("click", () => settingsDialog.close());
  resetDefaultKeyButton.addEventListener("click", () => {
    try {
      localStorage.removeItem(AES_KEY_STORAGE_KEY);
      localStorage.removeItem(ENCRYPTION_METHOD_STORAGE_KEY);
      localStorage.removeItem(THEME_STORAGE_KEY);
      localStorage.removeItem(SQL_BLOCKED_MARKERS_STORAGE_KEY);
      localStorage.removeItem(PROFESSIONAL_LIST_MODE_STORAGE_KEY);
      localStorage.removeItem(PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY);
    } catch {
      settingsError.textContent = "无法恢复默认设置，请检查浏览器的扩展存储设置。";
      settingsError.hidden = false;
      return;
    }

    settingsMethod.value = DEFAULT_ENCRYPTION_METHOD;
    settingsKey.value = DEFAULT_AES_KEY;
    settingsSqlBlockedMarkers.value = DEFAULT_SQL_BLOCKED_MARKERS.join("\n");
    updateEncryptionSettings();
    applyTheme(configuredTheme());
    applySidebarWidth(workspace.getBoundingClientRect().width * 0.32);
    onChange();
    settingsDialog.close();
  });
  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const method = getEncryptionMethod(settingsMethod.value).value;
    const key = settingsKey.value;
    const keyLength = new TextEncoder().encode(key).length;
    const config = getEncryptionMethod(method);
    if (config.keyLengths.length > 0 && !config.keyLengths.includes(keyLength)) {
      settingsError.textContent = `${config.label} 的密钥 UTF-8 长度必须为 ${config.keyLengths.join("、")} 字节。`;
      settingsError.hidden = false;
      return;
    }

    try {
      localStorage.setItem(AES_KEY_STORAGE_KEY, key);
      localStorage.setItem(ENCRYPTION_METHOD_STORAGE_KEY, method);
      localStorage.setItem(
        SQL_BLOCKED_MARKERS_STORAGE_KEY,
        parseSqlBlockedMarkers(settingsSqlBlockedMarkers.value).join("\n"),
      );
    } catch {
      settingsError.textContent = "无法保存设置，请检查浏览器的扩展存储设置。";
      settingsError.hidden = false;
      return;
    }

    settingsDialog.close();
    onChange();
  });

  applyTheme(configuredTheme());
}
