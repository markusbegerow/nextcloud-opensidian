import { useEffect } from "react";
import { useVaultStore } from "../store/vaultStore";

const POLL_INTERVAL = 30_000;

/** Poll the server every 30s and refresh the file list. */
export function useVaultWatcher() {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshFiles = useVaultStore((s) => s.refreshFiles);

  useEffect(() => {
    if (!vaultPath) return;

    const id = setInterval(() => {
      refreshFiles().catch(console.error);
    }, POLL_INTERVAL);

    return () => clearInterval(id);
  }, [vaultPath, refreshFiles]);
}
