/**
 * Circular View Transition Theme Toggle + Instant Fallback (prefers-reduced-motion safe)
 */
export type ThemePref = "dark" | "light" | "system";

export function resolveDark(pref: ThemePref): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyThemeInstant(pref: ThemePref): "dark" | "light" {
  const mode = resolveDark(pref) ? "dark" : "light";
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.remove("dark", "light");
  root.classList.add(mode);
  root.style.colorScheme = mode;
  return mode;
}

export function switchThemeWithCircle(
  nextPref: ThemePref,
  triggerEl?: HTMLElement | null,
  onCommit?: (pref: ThemePref) => void
): void {
  localStorage.setItem("qhub_theme", nextPref);
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const docAny = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };

  if (!docAny.startViewTransition || reduced) {
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(style);
    try {
      applyThemeInstant(nextPref);
      if (onCommit) onCommit(nextPref);
      window.getComputedStyle(document.body).opacity;
    } finally {
      setTimeout(() => style.remove(), 1);
    }
    return;
  }

  if (triggerEl) {
    const r = triggerEl.getBoundingClientRect();
    document.documentElement.style.setProperty("--x", `${Math.round(r.left + r.width / 2)}px`);
    document.documentElement.style.setProperty("--y", `${Math.round(r.top + r.height / 2)}px`);
  } else {
    document.documentElement.style.setProperty("--x", "50%");
    document.documentElement.style.setProperty("--y", "50%");
  }

  docAny.startViewTransition(() => {
    applyThemeInstant(nextPref);
    if (onCommit) onCommit(nextPref);
  });
}
