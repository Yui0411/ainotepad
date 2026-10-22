import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { noteKeys, saveNote } from '@/features/notes/api';
import { clearDraft, listDrafts } from '@/features/notes/drafts';

let running: Promise<void> | null = null;

/** Uploads every unsynced draft. Safe to call often; overlapping calls share one run. */
export function syncDrafts(queryClient: QueryClient): Promise<void> {
  if (running) return running;

  running = (async () => {
    let synced = false;
    for (const [id, draft] of listDrafts()) {
      // A new note that was emptied before it ever reached the server: nothing to save.
      if (draft.isNew && draft.body.trim() === '') {
        clearDraft(id, draft.body);
        continue;
      }
      try {
        await saveNote(id, draft.body, !draft.isNew);
        clearDraft(id, draft.body);
        synced = true;
      } catch {
        // Still offline or the server is unreachable: try again on the next trigger.
        break;
      }
    }
    if (synced) await queryClient.invalidateQueries({ queryKey: noteKeys.all });
  })().finally(() => {
    running = null;
  });

  return running;
}

/** Syncs drafts on mount, when the connection returns, and when the app comes to the foreground. */
export function useDraftSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    syncDrafts(queryClient);

    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) syncDrafts(queryClient);
    });
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') syncDrafts(queryClient);
    });

    return () => {
      unsubscribeOnline();
      appState.remove();
    };
  }, [queryClient]);
}
