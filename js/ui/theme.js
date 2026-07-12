const THEMES = new Set(["system", "light", "dark", "red"]);

export function normalizeThemePreference(preference) {
  return THEMES.has(preference) ? preference : "system";
}

export function resolveThemePreference(preference, prefersLight) {
  const normalized = normalizeThemePreference(preference);
  if (normalized === "system") return prefersLight ? "light" : "dark";
  return normalized;
}

export function themeColor(theme) {
  if (theme === "light") return "#eaf0f5";
  if (theme === "red") return "#100304";
  return "#07111f";
}
