import type { VaultFile } from "../types/vault";
import { readFilesBatch, basename } from "./nextcloudApi";
import { extractWikilinks } from "./wikilinkParser";
import { useWikilinkStore } from "../store/wikilinkStore";
import { useVaultStore } from "../store/vaultStore";
import { useNoteEmojiStore, extractNoteEmoji, extractHeadingPreview } from "../store/noteEmojiStore";

// Each note read is a separate PHP request, so keep concurrency low to leave the
// server's PHP workers free for everything else.
const CHUNK_SIZE = 4;

// Path -> mtime of the version last indexed, so a poll only re-reads new or changed notes.
const indexedMtimes = new Map<string, number | undefined>();

// Notes under dot-folders (.configs, .templates, hidden backups) aren't indexed; the graph
// already ignores them.
function isIndexable(f: VaultFile): boolean {
  return (
    !f.is_dir &&
    f.extension === "md" &&
    !f.path.split("/").some((segment) => segment.startsWith("."))
  );
}

export async function indexAll(files: VaultFile[], incremental = false): Promise<void> {
  const mdFiles = files.filter(isIndexable);
  useVaultStore.getState().setIndexing(true);
  try {
    if (!incremental) {
      indexedMtimes.clear();
      useWikilinkStore.getState().reset();
      useNoteEmojiStore.getState().reset();
    } else {
      const current = new Set(mdFiles.map((f) => f.path));
      for (const path of [...indexedMtimes.keys()]) {
        if (!current.has(path)) {
          indexedMtimes.delete(path);
          useWikilinkStore.getState().removeFile(path);
          useNoteEmojiStore.getState().setEmoji(path, null);
        }
      }
    }

    // A file without an mtime (older server code) is always re-read.
    const toRead = mdFiles.filter(
      (f) => f.mtime === undefined || !indexedMtimes.has(f.path) || indexedMtimes.get(f.path) !== f.mtime
    );

    for (let i = 0; i < toRead.length; i += CHUNK_SIZE) {
      const chunk = toRead.slice(i, i + CHUNK_SIZE);
      const results = await readFilesBatch(chunk.map((f) => f.path));

      for (const f of chunk) {
        const content = results.get(f.path);
        if (content !== null && content !== undefined) {
          indexFile(f.path, content);
          indexedMtimes.set(f.path, f.mtime);
        }
      }
    }
  } finally {
    useVaultStore.getState().setIndexing(false);
  }
}

export function indexFile(path: string, content: string): void {
  useWikilinkStore.getState().setLinksForFile(path, extractWikilinks(content));
  useNoteEmojiStore.getState().setEmoji(path, extractNoteEmoji(content));
  useNoteEmojiStore.getState().setPreview(path, extractHeadingPreview(content));
}

export function fileBasename(path: string): string {
  return basename(path, ".md");
}
