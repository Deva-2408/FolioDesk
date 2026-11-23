import { useEffect, useState } from "react";

export type WorkspaceLayoutMode = "split" | "paged";

/**
 * Determines whether the app should render the side-by-side 2/3 + 1/3 split layout
 * or the separated two-page mobile/portrait-tablet switcher layout:
 * - Desktop (landscape or >= 1280px wide): "split"
 * - Tablet Horizontal / Landscape (>= 768px wide, >= 500px tall, width > height): "split"
 * - Tablet Vertical / Portrait (e.g., 768x1024, 820x1180, 1024x1366): "paged"
 * - Mobile (portrait or short landscape phones): "paged"
 */
export function getWorkspaceLayoutMode(
  width: number,
  height: number,
): WorkspaceLayoutMode {
  if (width >= 1280) {
    return "split";
  }
  const isLandscape = width > height;
  if (width >= 768 && height >= 500 && isLandscape) {
    return "split";
  }
  return "paged";
}

export function useWorkspaceLayoutMode(): WorkspaceLayoutMode {
  const [mode, setMode] = useState<WorkspaceLayoutMode>(() => {
    if (typeof window === "undefined") return "split";
    return getWorkspaceLayoutMode(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    const update = () => {
      setMode(getWorkspaceLayoutMode(window.innerWidth, window.innerHeight));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return mode;
}
