import { create } from "zustand";
import type { VaultFile } from "../types/vault";
import { listFiles, getSettings, saveSettings } from "../lib/nextcloudApi";
import { indexAll } from "../lib/vaultIndexer";
import { useWikilinkStore } from "./wikilinkStore";
import { useColorStore } from "./colorStore";

interface VaultState {
  vaultPath: string | null;
  files: VaultFile[];
  isIndexing: boolean;
  isLoading: boolean;

  initFromSettings: () => Promise<void>;
  openVault: (path: string) => Promise<void>;
  changeVault: (path: string) => Promise<void>;
  refreshFiles: () => Promise<void>;
  setIndexing: (v: boolean) => void;
}

export const useVaultStore = create<VaultState>()((set, get) => ({
  vaultPath: null,
  files: [],
  isIndexing: false,
  isLoading: true,

  setIndexing: (v) => set({ isIndexing: v }),

  /** Called once on app mount — load saved vault path and open it. */
  initFromSettings: async () => {
    try {
      const settings = await getSettings();
      if (settings.vaultPath) {
        await get().openVault(settings.vaultPath);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    } finally {
      set({ isLoading: false });
    }
  },

  openVault: async (path) => {
    set({ isLoading: true });
    try {
      const files = await listFiles(path);
      set({ vaultPath: path, files });
      await Promise.all([
        indexAll(files),
        useColorStore.getState().loadFromVault(path, files),
      ]);
    } finally {
      set({ isLoading: false });
    }
  },

  /** Save a new vault path and open it. */
  changeVault: async (path) => {
    await saveSettings({ vaultPath: path });
    await get().openVault(path);
  },

  // One refresh runs at a time, so slow responses can't stack up overlapping refreshes.
  // A request made meanwhile (e.g. after creating a note) queues one rerun.
  refreshFiles: () => {
    if (refreshRunning) {
      refreshQueued = true;
      return refreshRunning;
    }
    refreshRunning = (async () => {
      try {
        do {
          refreshQueued = false;
          const { vaultPath } = get();
          if (!vaultPath) return;
          const listed = await listFiles(vaultPath);
          // Only replace the list when something changed: a new array re-lays-out the graph.
          if (filesSignature(listed) !== filesSignature(get().files)) set({ files: listed });
          const { files } = get();
          await indexAll(files, true);
          // Reload color config if colors.md exists in the refreshed file list
          await useColorStore.getState().loadFromVault(vaultPath, files);
        } while (refreshQueued);
      } finally {
        refreshRunning = null;
      }
    })();
    return refreshRunning;
  },
}));

let refreshRunning: Promise<void> | null = null;
let refreshQueued = false;

function filesSignature(files: VaultFile[]): string {
  return files.map((f) => `${f.path}|${f.is_dir ? 1 : 0}|${f.mtime ?? ""}`).join("\n");
}
