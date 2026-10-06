import { createContext, useContext, useState, type ReactNode } from "react";
type Theme = "dark" | "light";
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "dark",
  toggleTheme: () => {},
});
function initialTheme(): Theme {
  try {
    return localStorage.getItem("navalha:theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  document.documentElement.dataset.theme = theme;
  const toggleTheme = () =>
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("navalha:theme", next);
      } catch {
        /* Private browsing may disable storage. */
      }
      return next;
    });
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
