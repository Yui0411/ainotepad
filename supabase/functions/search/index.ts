// Searches the signed-in user's notes. Embeds the query with Gemini, then runs
// search_notes as the user so row-level security applies. If Gemini fails, falls
// back to keyword-only search instead of erroring.

import { withSupabase } from 'npm:@supabase/server@1';
import { embed, queryInput } from '../_shared/gemini.ts';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_QUERY_CHARS = 1_000;

type SearchRequest = {
  query?: unknown;
  tagIds?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  limit?: unknown;
};

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'expected POST' }, { status: 405 });
    }

    let input: SearchRequest;
    try {
      input = await req.json();
    } catch {
      return badRequest('expected a JSON body');
    }

    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (query === '') return badRequest('query is required');
    if (query.length > MAX_QUERY_CHARS) return badRequest(`query is longer than ${MAX_QUERY_CHARS} characters`);

    let tagIds: string[] | null = null;
    if (input.tagIds !== undefined && input.tagIds !== null) {
      if (!Array.isArray(input.tagIds) || !input.tagIds.every((id) => typeof id === 'string')) {
        return badRequest('tagIds must be an array of strings');
      }
      tagIds = input.tagIds.length > 0 ? input.tagIds : null;
    }

    const limit =
      typeof input.limit === 'number' && Number.isFinite(input.limit)
        ? Math.min(Math.max(Math.trunc(input.limit), 1), MAX_LIMIT)
        : DEFAULT_LIMIT;

    let queryEmbedding: string | null = null;
    try {
      queryEmbedding = JSON.stringify(await embed(queryInput(query)));
    } catch (err) {
      console.error('query embedding failed, using keyword search only:', err instanceof Error ? err.message : err);
    }

    const { data, error } = await ctx.supabase.rpc('search_notes', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: limit,
      filter_tag_ids: tagIds,
      date_from: optionalString(input.dateFrom),
      date_to: optionalString(input.dateTo),
    });

    if (error) {
      console.error('search_notes failed:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ results: data ?? [], semantic: queryEmbedding !== null });
  }),
};
