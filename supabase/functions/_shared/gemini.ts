// Gemini embeddings. gemini-embedding-2 takes the task as a text prefix rather
// than a task_type field, and normalizes reduced-dimension output itself.

const MODEL = 'gemini-embedding-2';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

// Must match the vector(768) columns in the database.
export const EMBEDDING_DIMENSIONS = 768;

// Well under the model's 8,192-token input limit.
const MAX_INPUT_CHARS = 24_000;

export function documentInput(body: string, tags: string[]): string {
  const tagLine = tags.length > 0 ? `tags: ${tags.join(', ')}\n\n` : '';
  return `title: none | text: ${tagLine}${body}`;
}

export function queryInput(query: string): string {
  return `task: search result | query: ${query}`;
}

export async function embed(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: `models/${MODEL}`,
      content: { parts: [{ text: text.slice(0, MAX_INPUT_CHARS) }] },
      output_dimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`Gemini embedContent failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const values: unknown = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Gemini returned ${Array.isArray(values) ? values.length : 'no'} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }

  return normalize(values as number[]);
}

// Gemini should already normalize, but cosine ranking is only stable if every
// stored vector is unit length, so make sure.
function normalize(values: number[]): number[] {
  const norm = Math.hypot(...values);
  return norm === 0 ? values : values.map((v) => v / norm);
}
