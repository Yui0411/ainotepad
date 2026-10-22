// Embeds notes whose text or tags changed. Called every minute by pg_cron
// (see the embedding_worker migration) with the secret key in the apikey header.

import { withSupabase } from 'npm:@supabase/server@1';
import { documentInput, embed } from '../_shared/gemini.ts';

const BATCH_SIZE = 20;

type PendingNote = {
  id: string;
  version: string;
  attempts: number;
  body: string;
  tags: string[];
};

export default {
  fetch: withSupabase({ auth: 'secret' }, async (_req, ctx) => {
    const db = ctx.supabaseAdmin;

    const { data, error } = await db.rpc('notes_pending_embedding', { batch_size: BATCH_SIZE });
    if (error) {
      console.error('loading pending notes failed:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const notes = (data ?? []) as PendingNote[];
    let embedded = 0;
    let failed = 0;

    for (const note of notes) {
      try {
        const isEmpty = note.body.trim() === '' && note.tags.length === 0;
        const embedding = isEmpty
          ? null
          : JSON.stringify(await embed(documentInput(note.body, note.tags)));

        // Matching on content_changed_at means an edit made while we were
        // embedding isn't overwritten; that note just gets picked up next run.
        const { error: updateError } = await db
          .from('notes')
          .update({ embedding, embedded_version: note.version, embedding_error: null })
          .eq('id', note.id)
          .eq('content_changed_at', note.version);
        if (updateError) throw new Error(updateError.message);

        embedded++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`embedding note ${note.id} failed:`, message);

        await db
          .from('notes')
          .update({ embedding_attempts: note.attempts + 1, embedding_error: message.slice(0, 1000) })
          .eq('id', note.id)
          .eq('content_changed_at', note.version);
      }
    }

    return Response.json({ embedded, failed });
  }),
};
