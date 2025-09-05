// app/api/interpreter/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const DEFAULT_MODEL = process.env.SUMMARIZER_MODEL || 'gpt-4o-mini';
const MAX_INPUT_CHARS = 120_000;

/* ---------------- utils ---------------- */
function keyFromUrl(url: string) {
  const marker = '/object/public/project-docs/';
  const i = url?.indexOf?.(marker) ?? -1;
  return i >= 0 ? url.slice(i + marker.length) : '';
}
function basicClean(t: string) {
  return t.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
}
function stripHtml(html: string) {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<\/h[1-6]>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  return basicClean(s);
}
async function blobToTextOrNull(blob: Blob) {
  try {
    const txt = await blob.text();
    if (/<!doctype html>|<html[\s>]|<body[\s>]/i.test(txt)) return stripHtml(txt);
    return basicClean(txt);
  } catch { return null; }
}

// remove most markdown/styling if model sneaks it in
function toPlain(s: string) {
  return s
    .replace(/^#{1,6}\s+/gm, '')      // headings
    .replace(/^\s*[-*•]\s+/gm, '')    // bullets
    .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
    .replace(/_(.*?)_/g, '$1')        // italics
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // code
    .replace(/\r\n?/g, '\n')
    .trim();
}

function isVeryShort(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words <= 15 && text.length <= 120;
}

// ultra-reliable conversational fallback (plain text)
function conversationalFallback(text: string) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (isVeryShort(text)) {
    return `This file contains a single short line: “${oneLine}”. There’s no extra context or structure—just the phrase.\nTL;DR: a brief one-liner with no additional detail.`;
  }
  const first = oneLine.slice(0, 200);
  return `Here’s a quick take in plain English. The content is simple and unstructured. The opening reads: “${first}${oneLine.length > 200 ? '…' : ''}”.\nTL;DR: a brief, lightly detailed note.`;
}

/* ---------------- OpenAI helpers ---------------- */
function extractResponsesText(resp: any): string {
  if (typeof resp?.output_text === 'string') return resp.output_text.trim();
  const out = resp?.output ?? resp?.data ?? [];
  const parts: string[] = [];
  (function walk(n: any) {
    if (!n) return;
    if (typeof n === 'string') { parts.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.text?.value) parts.push(String(n.text.value));
    if (n.content) walk(n.content);
    if (n.value) walk(n.value);
    if (n.type === 'output_text' && typeof n.text === 'string') parts.push(n.text);
  })(out);
  return parts.join('\n').trim();
}
function extractChatText(resp: any): string {
  const c = resp?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) return c.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('\n').trim();
  return (c ?? '').toString().trim();
}

async function aiConversationalSummary(text: string, model: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { summary: '', truncated: false, via: 'no-key' as const };

  const client = new OpenAI({ apiKey });
  const truncated = text.length > MAX_INPUT_CHARS;
  const input = truncated ? text.slice(0, MAX_INPUT_CHARS) : text;

  // Conversational, plain-text style (no markdown)
  const system =
    'You are Zeta, a friendly assistant. Summarize the user’s file conversationally in 2–4 sentences. ' +
    'Use plain text only (no markdown, no bullets, no headings, no emoji). End with a final line that starts with "TL;DR: " followed by a one-sentence takeaway. ' +
    'If the file is extremely short (just a phrase or a single line), acknowledge that and paraphrase briefly, still plain text.';

  // Try Responses API
  try {
    const r = await client.responses.create({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: input },
      ],
      temperature: 0.2,
    });
    const t = extractResponsesText(r);
    if (t) return { summary: toPlain(t), truncated, via: 'responses' as const };
  } catch {}

  // Fallback: Chat Completions
  try {
    const r = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: input },
      ],
      temperature: 0.2,
    });
    const t = extractChatText(r);
    if (t) return { summary: toPlain(t), truncated, via: 'chat' as const };
  } catch {}

  return { summary: '', truncated, via: 'empty' as const };
}

async function summarizeGuaranteed(text: string, model: string) {
  // Special case: very short text → craft a conversational line ourselves
  if (isVeryShort(text)) {
    return { summary: conversationalFallback(text), truncated: false, model: 'fallback-short', via: 'local-short' as const };
  }
  const out = await aiConversationalSummary(text, model);
  let summary = (out.summary || '').trim();
  if (!summary) summary = conversationalFallback(text);
  // ensure last line has TL;DR
  if (!/^\s*TL;DR:/mi.test(summary)) {
    const snip = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    summary = `${summary}\nTL;DR: ${snip || 'brief plain-text takeaway.'}`;
  }
  return { summary, truncated: !!out.truncated || text.length > MAX_INPUT_CHARS, model, via: out.via };
}

/* ---------------- health ---------------- */
export async function GET() {
  return NextResponse.json({ ok: true, msg: 'interpreter alive', methods: ['POST'] });
}
export async function OPTIONS() {
  return NextResponse.json({}, { headers: { Allow: 'GET,POST,OPTIONS' } });
}

/* ---------------- main ---------------- */
export async function POST(req: Request) {
  try {
    const ctype = (req.headers.get('content-type') || '').toLowerCase();

    // multipart/form-data → local upload
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      const project_id = String(form.get('project_id') ?? '').trim();
      const model = String(form.get('model') ?? DEFAULT_MODEL);

      if (!file || !project_id) {
        return NextResponse.json({ error: 'Missing file or project_id' }, { status: 400 });
      }

      const ab = await file.arrayBuffer().catch(() => null);
      const size = ab ? ab.byteLength : null;
      const text = await blobToTextOrNull(file);

      if (text == null) {
        return NextResponse.json({
          ok: true, project_id, mode: 'upload', file_name: file.name,
          is_text: false, size,
          summary: 'This file is not text-like (or cannot be decoded as UTF-8/HTML).',
          reason: 'binary-or-unknown',
        });
      }
      if (!text.trim()) {
        return NextResponse.json({
          ok: true, project_id, mode: 'upload', file_name: file.name,
          is_text: true, size,
          summary: 'This file is empty or contains no readable text.',
          reason: 'empty-text',
        });
      }

      const out = await summarizeGuaranteed(text, model);
      return NextResponse.json({
        ok: true, project_id, mode: 'upload', file_name: file.name, is_text: true,
        input_chars: text.length, ...out,
      });
    }

    // JSON → summarize from Storage (uploaded/generated)
    const body = await req.json().catch(() => ({} as any));
    const project_id: string = String(body.project_id ?? body.projectId ?? '').trim();
    const storage_key_in: string = String(body.storage_key ?? '').trim();
    const file_url: string = String(body.file_url ?? '').trim();
    const file_name: string = String(body.file_name ?? '').trim();
    const model: string = String(body.model ?? DEFAULT_MODEL);

    if (!project_id) {
      return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
    }

    const storage_key =
      storage_key_in ||
      (file_url ? keyFromUrl(file_url) : '') ||
      (file_name ? `${project_id}/uploaded/${file_name}` : '');

    if (!storage_key) {
      return NextResponse.json({ error: 'Unable to resolve storage_key' }, { status: 400 });
    }

    const { data, error } = await supabase.storage.from('project-docs').download(storage_key);
    if (error) {
      return NextResponse.json({ error: `Download failed: ${error.message}` }, { status: 500 });
    }

    const ab = await data.arrayBuffer().catch(() => null);
    const size = ab ? ab.byteLength : null;
    const text = await blobToTextOrNull(data);

    if (text == null) {
      return NextResponse.json({
        ok: true, project_id, mode: 'storage', storage_key,
        is_text: false, size,
        summary: 'This file is not text-like (or cannot be decoded as UTF-8/HTML).',
        reason: 'binary-or-unknown',
      });
    }
    if (!text.trim()) {
      return NextResponse.json({
        ok: true, project_id, mode: 'storage', storage_key,
        is_text: true, size,
        summary: 'This file is empty or contains no readable text.',
        reason: 'empty-text',
      });
    }

    const out = await summarizeGuaranteed(text, model);
    return NextResponse.json({
      ok: true, project_id, mode: 'storage', storage_key, is_text: true,
      input_chars: text.length, ...out,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Interpreter crashed' }, { status: 500 });
  }
}
