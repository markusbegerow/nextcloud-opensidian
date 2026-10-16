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

  refreshFiles: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    const files = await listFiles(vaultPath);
    set({ files });
    await indexAll(files);
    // Reload color config if colors.md exists in the refreshed file list
    await useColorStore.getState().loadFromVault(vaultPath, files);
  },
}));
