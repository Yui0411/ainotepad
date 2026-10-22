import 'expo-sqlite/localStorage/install';

// Unsynced note text, kept on the phone until Supabase confirms the save, so
// nothing typed is lost to a dropped connection or a closed app.

const STORAGE_KEY = 'ainotepad:drafts';

export type Draft = {
  body: string;
  /** True if the note may not exist on the server yet. */
  isNew: boolean;
};

type Drafts = Record<string, Draft>;

function readAll(): Drafts {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Drafts;
  } catch {
    return {};
  }
}

function writeAll(drafts: Drafts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function getDraft(id: string): Draft | undefined {
  return readAll()[id];
}

export function listDrafts(): [string, Draft][] {
  return Object.entries(readAll());
}

export function hasDrafts(): boolean {
  return listDrafts().length > 0;
}

export function setDraft(id: string, draft: Draft) {
  writeAll({ ...readAll(), [id]: draft });
}

/** Clears the draft only if it still holds `body`, so newer typing isn't dropped. */
export function clearDraft(id: string, body: string) {
  const drafts = readAll();
  if (drafts[id]?.body !== body) return;
  delete drafts[id];
  writeAll(drafts);
}

export function clearAllDrafts() {
  localStorage.removeItem(STORAGE_KEY);
}
