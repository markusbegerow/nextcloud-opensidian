import { useEffect } from "react";
import { useVaultStore } from "../store/vaultStore";

const POLL_INTERVAL = 120_000;

/** Poll the server every 2 min while the tab is visible, and on returning to it. */
export function useVaultWatcher() {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshFiles = useVaultStore((s) => s.refreshFiles);

  useEffect(() => {
    if (!vaultPath) return;

    const refreshIfVisible = () => {
      if (!document.hidden) refreshFiles().catch(console.error);
    };
    const id = setInterval(refreshIfVisible, POLL_INTERVAL);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [vaultPath, refreshFiles]);
}
