'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/* ======================= Types ======================= */

type TemplateRow = {
  id: string;
  slug: string;           // e.g., 'zeta-build'
  title: string;          // e.g., 'Zeta Build'
  short_desc: string | null;
  purpose: string | null;
  traits: string[] | null;        // jsonb
  perfect_for: string[] | null;   // jsonb
  image_url: string | null;
  is_active: boolean;
};

type AssistantCard = {
  slug: string;       // canonical (zeta-build)
  idShort: string;    // for route (build)
  name: string;
  image: string;
  description: string;
  purpose: string;
  traits: string[];
  perfectFor: string[];
};

/* ======================= Modal ======================= */

function TemplateModal({
  open,
  onClose,
  onUse,
  assistant,
}: {
  open: boolean;
  onClose: () => void;
  onUse: (slugOrIdShort: string) => void;
  assistant: AssistantCard | null;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !assistant) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 animate-[fadeIn_.12s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{assistant.name}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[140px_1fr]">
          <div className="flex items-center justify-center">
            <Image
              src={assistant.image || '/zeta.png'}
              alt={assistant.name}
              width={120}
              height={120}
              className="rounded-xl"
            />
          </div>
          <div>
            <p className="text-sm text-gray-700">{assistant.purpose}</p>

            {assistant.traits.length > 0 && (
              <>
                <h4 className="mt-4 text-sm font-semibold text-gray-900">Signature Traits</h4>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {assistant.traits.slice(0, 8).map((t) => (
                    <li
                      key={t}
                      className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-800"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {assistant.perfectFor.length > 0 && (
              <>
                <h4 className="mt-5 text-sm font-semibold text-gray-900">Perfect For</h4>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {assistant.perfectFor.map((p) => (
                    <li
                      key={p}
                      className="rounded-md bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={() => onUse(assistant.idShort)}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            type="button"
          >
            Use this template
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Page ======================= */

export default function PantheonSelection() {
  const router = useRouter();
  const params = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // idShort
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAssistant, setModalAssistant] = useState<AssistantCard | null>(null);

  // Fetch active templates from DB
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('zeta_templates')
        .select('id, slug, title, short_desc, purpose, traits, perfect_for, image_url, is_active')
        .eq('is_active', true)
        .order('title');
      if (!error && data) setRows(data as TemplateRow[]);
      setLoading(false);
    })();
  }, []);

  // Map DB rows → UI cards
  const assistants: AssistantCard[] = useMemo(() => {
    return rows.map((r) => {
      const idShort = r.slug?.startsWith('zeta-') ? r.slug.slice(5) : r.slug;
      return {
        slug: r.slug,
        idShort,
        name: r.title,
        image: r.image_url || '/zeta.png',
        description: r.short_desc || '',
        purpose: r.purpose || '',
        traits: (r.traits ?? []) as string[],
        perfectFor: (r.perfect_for ?? []) as string[],
      };
    });
  }, [rows]);

  // Preselect via ?template=quant (or slug)
  useEffect(() => {
    if (!assistants.length) return;
    const t = params.get('template');
    if (!t) return;
    const found =
      assistants.find((a) => a.idShort.toLowerCase() === t.toLowerCase()) ||
      assistants.find((a) => a.slug.toLowerCase() === t.toLowerCase());
    if (found) {
      setSelected(found.idShort);
      setModalAssistant(found);
      setModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistants.length]);

  // Search
  const filteredAssistants = useMemo(() => {
    if (!query.trim()) return assistants;
    const q = query.toLowerCase();
    return assistants.filter((a) =>
      [a.name, a.description, a.purpose, ...a.traits, ...a.perfectFor, a.idShort, a.slug]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [assistants, query]);

  const openModal = (a: AssistantCard) => {
    setModalAssistant(a);
    setModalOpen(true);
    setSelected(a.idShort);
  };

  const handleContinue = () => {
    if (!selected) return;
    router.push(`/zetasetup/${selected}`); // e.g., /zetasetup/build
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 py-12 space-y-8">
      <h1 className="text-4xl font-bold text-center">Choose your Zeta template</h1>
      <p className="text-md text-gray-700 text-center max-w-2xl">
        Pick a starting point. You can customize everything later.
      </p>

      {/* Search */}
      <div className="w-full max-w-3xl">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates (e.g., build, learn, code, recipes, finance, mindset)…"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 pl-10 text-sm focus:border-black focus:outline-none"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {loading
            ? 'Loading templates…'
            : query
            ? `${filteredAssistants.length} result${filteredAssistants.length === 1 ? '' : 's'}`
            : `Showing ${assistants.length} templates`}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 w-full max-w-6xl">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[360px] w-full rounded-2xl border-2 border-gray-200 bg-white p-6 shadow-md animate-pulse"
            />
          ))
        ) : filteredAssistants.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 p-10 text-center">
            <div className="text-2xl">🤔</div>
            <p className="mt-2 text-sm text-gray-600">
              No templates match “{query}”. Try a different search.
            </p>
          </div>
        ) : (
          filteredAssistants.map((a) => {
            const isSelected = selected === a.idShort;
            return (
              <button
                key={a.slug}
                onClick={() => openModal(a)}
                className={[
                  'bg-white rounded-2xl p-6 shadow-md flex flex-col items-center text-center h-[360px]',
                  'transition border-2 w-full',
                  isSelected ? 'border-black ring-2 ring-black' : 'border-gray-200 hover:border-black',
                ].join(' ')}
                type="button"
              >
                <div className="h-[120px] flex items-end justify-center">
                  <Image
                    src={a.image}
                    alt={a.name}
                    width={110}
                    height={110}
                    className="object-contain rounded-xl"
                  />
                </div>
                <div className="flex flex-col justify-between items-center text-center flex-grow mt-4 w-full">
                  <div>
                    <p className="text-xl font-bold">{a.name}</p>
                    <p className="text-sm text-gray-600 mt-1">{a.description}</p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <button
        onClick={handleContinue}
        disabled={!selected}
        className="bg-black text-white px-8 py-3 rounded-full text-lg hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>

      {/* Modal */}
      <TemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUse={(idShort) => {
          setModalOpen(false);
          router.push(`/zetasetup/${idShort}`);
        }}
        assistant={modalAssistant}
      />
    </div>
  );
}
