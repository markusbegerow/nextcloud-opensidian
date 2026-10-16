import { create } from "zustand";
import { readFile } from "../lib/nextcloudApi";
import type { VaultFile } from "../types/vault";

export interface EmojiColor {
  color: string;
  label: string;
}

interface ColorState {
  emojiMap: Record<string, EmojiColor>;
  loadFromVault: (vaultPath: string, files: VaultFile[]) => Promise<void>;
}

export const BUILTIN_EMOJI_COLORS: Record<string, string> = {
  "🟥": "#e53935", "🟧": "#ef6c00", "🟨": "#f9a825", "🟩": "#43a047",
  "🟦": "#1e88e5", "🟪": "#8e24aa", "🟫": "#6d4c41", "⬛": "#616161",
  "⬜": "#bdbdbd", "🔴": "#e53935", "🟠": "#ef6c00", "🟡": "#f9a825",
  "🟢": "#43a047", "🔵": "#1e88e5", "🟣": "#8e24aa", "⚫": "#616161",
  "⚪": "#bdbdbd",
};

const COLORS_PATHS = [".configs/colors.md", ".config/colors.md", "colors.md"];

function parseColorsFile(content: string): Record<string, { color?: string; label: string }> {
  const result: Record<string, { color?: string; label: string }> = {};
  for (const line of content.split("\n")) {
    if (!line.includes("|")) continue;
    const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const emoji = parts[0];
    if (!emoji || emoji.startsWith("-") || emoji.toLowerCase() === "emoji") continue;
    const colorMatch = parts[1].match(/#([0-9a-fA-F]{3,6})/);
    const label = parts[2];
    result[emoji] = { color: colorMatch ? `#${colorMatch[1]}` : undefined, label };
  }
  return result;
}

function buildEmojiMap(parsed: Record<string, { color?: string; label: string }>): Record<string, EmojiColor> {
  const map: Record<string, EmojiColor> = {};
  for (const [emoji, color] of Object.entries(BUILTIN_EMOJI_COLORS)) {
    map[emoji] = { color, label: "" };
  }
  for (const [emoji, entry] of Object.entries(parsed)) {
    const builtinColor = BUILTIN_EMOJI_COLORS[emoji];
    map[emoji] = { color: entry.color ?? builtinColor ?? "#cba6f7", label: entry.label };
  }
  return map;
}

const INITIAL_MAP: Record<string, EmojiColor> = Object.fromEntries(
  Object.entries(BUILTIN_EMOJI_COLORS).map(([emoji, color]) => [emoji, { color, label: "" }])
);

export const useColorStore = create<ColorState>()((set) => ({
  emojiMap: INITIAL_MAP,

  loadFromVault: async (vaultPath, files) => {
    // Only read a candidate path if it actually exists in the vault file list.
    // Avoids 404 console noise for optional config files that haven't been created yet.
    for (const candidate of COLORS_PATHS) {
      const fullPath = `${vaultPath}/${candidate}`;
      const file = files.find((f) => f.path === fullPath);
      if (!file) continue;
      // Skip the read, and the graph re-layout a new emojiMap triggers, when the
      // colours file hasn't changed since it was last loaded.
      const key = `${fullPath}|${file.mtime ?? ""}`;
      if (file.mtime !== undefined && key === loadedColorsKey) return;
      try {
        const content = await readFile(fullPath);
        const parsed = parseColorsFile(content);
        set({ emojiMap: buildEmojiMap(parsed) });
        loadedColorsKey = key;
        return;
      } catch { /* skip unreadable file */ }
    }
  },
}));

let loadedColorsKey: string | null = null;
