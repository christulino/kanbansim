import { useEffect, useState } from "react";
import { applyTheme, readTheme, writeTheme, type Theme } from "../theme/theme.js";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
    writeTheme(theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  const label = theme === "light" ? "◐ Lab Mode" : "○ Day Mode";

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme" type="button">
      {label}
    </button>
  );
}
