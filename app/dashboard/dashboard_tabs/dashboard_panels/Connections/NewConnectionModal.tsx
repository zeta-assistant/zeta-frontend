'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type DirectoryRow = {
  assistant_id: string;
  project_name?: string | null;
  owner_username?: string | null;
  owner_user_id?: string | null; // used to filter out self when using agents_registry
  level?: string | null;
  title?: string | null;
  created_at?: string | null;
};

export default function NewConnectionModal({
  onPick,
  onClose,
}: {
  onPick: (assistantId: string) => void;
  onClose: () => void;
}) {
  const [assistantIdInput, setAssistantIdInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHit, setSearchHit] = useState<DirectoryRow | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [loadingDir, setLoadingDir] = useState(true);
  const [dir, setDir] = useState<DirectoryRow[]>([]);

  // for filtering out self
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myAgentIds, setMyAgentIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      // who am I?
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      setMyUserId(uid);

      // get my own assistant ids to filter them out of the directory
      let own: string[] = [];
      if (uid) {
        const { data: mine } = await supabase
          .from('user_projects')
          .select('assistant_id')
          .eq('user_id', uid)
          .not('assistant_id', 'is', null);
        own = (mine || []).map((r: any) => r.assistant_id);
      }
      setMyAgentIds(own);

      await fetchDirectory(uid, own);
    })();
  }, []);

  async function fetchDirectory(uid: string | null, ownIds: string[]) {
    setLoadingDir(true);

    // 1) Preferred: public agent_directory view (includes other users by design)
    try {
      const v = await supabase
        .from('agent_directory')
        .select('assistant_id, project_name, owner_username, level, title, created_at, owner_user_id')
        .order('created_at', { ascending: false })
        .limit(100);

      if (v.data) {
        const rows = (v.data as any[])
          // filter out my own (by user_id or assistant id)
          .filter(r => (r.owner_user_id ? r.owner_user_id !== uid : true))
          .filter(r => !ownIds.includes(r.assistant_id));
        setDir(rows);
        setLoadingDir(false);
        return;
      }
    } catch { /* fall through */ }

    // 2) Fallback: agents_registry table (public-read of listed agents)
    try {
      const reg = await supabase
        .from('agents_registry')
        .select('assistant_id, project_name, level, title, created_at, user_id')
        .eq('is_listed', true)
        .order('created_at', { ascending: false })
        .limit(100);

      if (reg.data) {
        const rows = reg.data as any[];
        // try to fetch usernames from profiles if available
        let userMap: Record<string, string> = {};
        try {
          const ids = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
          if (ids.length) {
            const profs = await supabase.from('profiles').select('id, username').in('id', ids);
            (profs?.data || []).forEach((p: any) => { userMap[p.id] = p.username || ''; });
          }
        } catch { /* ignore */ }

        const mapped: DirectoryRow[] = rows.map(r => ({
          assistant_id: r.assistant_id,
          project_name: r.project_name,
          level: r.level,
          title: r.title,
          created_at: r.created_at,
          owner_user_id: r.user_id,
          owner_username: userMap[r.user_id] ?? null,
        }))
        // filter out my own
        .filter(r => (uid ? r.owner_user_id !== uid : true))
        .filter(r => !ownIds.includes(r.assistant_id));

        setDir(mapped);
        setLoadingDir(false);
        return;
      }
    } catch { /* fall through */ }

    // 3) Last resort: user_projects (likely RLS => only your rows)
    try {
      const up = await supabase
        .from('user_projects')
        .select('assistant_id, name, type, user_id, created_at')
        .not('assistant_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      const rows = up.data || [];

      // optionally decorate with usernames
      let userMap: Record<string, string> = {};
      try {
        const ids = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
        if (ids.length) {
          const profs = await supabase.from('profiles').select('id, username').in('id', ids);
          (profs?.data || []).forEach((p: any) => { userMap[p.id] = p.username || ''; });
        }
      } catch {}

      const mapped: DirectoryRow[] = rows.map((r: any) => ({
        assistant_id: r.assistant_id,
        project_name: r.name,
        owner_username: userMap[r.user_id] ?? null,
        owner_user_id: r.user_id,
        level: r.type,
        title: r.name ? `${r.name} Agent` : null,
        created_at: r.created_at,
      }))
      // filter out my own
      .filter(r => (uid ? r.owner_user_id !== uid : true))
      .filter(r => !ownIds.includes(r.assistant_id));

      setDir(mapped);
    } catch {
      setDir([]);
    } finally {
      setLoadingDir(false);
    }
  }

  async function onSearch() {
    const id = assistantIdInput.trim();
    if (!id) return;

    setSearching(true);
    setSearchError(null);
    setSearchHit(null);

    // Try directory first
    try {
      const v = await supabase
        .from('agent_directory')
        .select('assistant_id, project_name, owner_username, owner_user_id, level, title, created_at')
        .eq('assistant_id', id)
        .maybeSingle();

      if (v.data) {
        // ignore if this is one of my own agents
        if (myAgentIds.includes(v.data.assistant_id) || (myUserId && v.data.owner_user_id === myUserId)) {
          setSearchError('That assistant belongs to you.');
        } else {
          setSearchHit(v.data as any);
        }
        setSearching(false);
        return;
      }
    } catch { /* fall through */ }

    // Fallback: agents_registry
    try {
      const reg = await supabase
        .from('agents_registry')
        .select('assistant_id, project_name, level, title, created_at, user_id')
        .eq('assistant_id', id)
        .maybeSingle();

      if (reg.data) {
        if (myAgentIds.includes(reg.data.assistant_id) || (myUserId && reg.data.user_id === myUserId)) {
          setSearchError('That assistant belongs to you.');
        } else {
          let username: string | null = null;
          try {
            const prof = await supabase.from('profiles').select('username').eq('id', reg.data.user_id).maybeSingle();
            username = prof.data?.username ?? null;
          } catch {}
          setSearchHit({
            assistant_id: reg.data.assistant_id,
            project_name: reg.data.project_name,
            owner_username: username,
            owner_user_id: reg.data.user_id,
            level: reg.data.level,
            title: reg.data.title,
            created_at: reg.data.created_at,
          });
        }
        setSearching(false);
        return;
      }
    } catch { /* fall through */ }

    // Last resort: user_projects (may not return others due to RLS)
    try {
      const up = await supabase
        .from('user_projects')
        .select('assistant_id, name, type, user_id, created_at')
        .eq('assistant_id', id)
        .maybeSingle();

      if (up.data) {
        if (myAgentIds.includes(up.data.assistant_id) || (myUserId && up.data.user_id === myUserId)) {
          setSearchError('That assistant belongs to you.');
        } else {
          let username: string | null = null;
          try {
            const prof = await supabase.from('profiles').select('username').eq('id', up.data.user_id).maybeSingle();
            username = prof.data?.username ?? null;
          } catch {}

          setSearchHit({
            assistant_id: up.data.assistant_id,
            project_name: up.data.name,
            owner_username: username,
            owner_user_id: up.data.user_id,
            level: up.data.type,
            title: up.data.name ? `${up.data.name} Agent` : null,
            created_at: up.data.created_at,
          });
        }
        setSearching(false);
        return;
      }

      setSearchError('No agent found with that Assistant ID.');
    } catch (e: any) {
      setSearchError(e?.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-[720px] max-w-[95vw] rounded-2xl border border-blue-700 bg-blue-950 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-base font-semibold text-purple-100">Add new connection</h4>
          <button
            className="px-2 py-1 text-xs rounded-md bg-blue-900/60 text-purple-200 border border-blue-700 hover:bg-blue-900"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <label className="block text-xs text-purple-200/80 mb-1">Assistant ID</label>
        <div className="flex gap-2">
          <input
            value={assistantIdInput}
            onChange={(e) => setAssistantIdInput(e.target.value)}
            placeholder="asst_XXXXXXXXXXXX"
            className="flex-1 rounded-lg bg-blue-900/60 border border-blue-700 text-purple-100 text-sm px-3 py-2 font-mono"
          />
          <button
            onClick={onSearch}
            disabled={!assistantIdInput.trim() || searching}
            className="px-3 py-2 rounded-lg bg-teal-500 text-white text-sm hover:bg-teal-400 disabled:opacity-50 transition"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {searchError && <div className="mt-2 text-sm text-amber-300">{searchError}</div>}

        {searchHit && (
          <div className="mt-3 rounded-xl border border-blue-800 bg-blue-900/40 p-3">
            <div className="text-sm text-purple-200">
              Found agent <span className="font-mono">{searchHit.assistant_id}</span>
            </div>
            <div className="text-[11px] text-purple-300/70">
              {searchHit.owner_username ? `@${searchHit.owner_username} • ` : null}
              {searchHit.project_name || 'Untitled Project'}
              {searchHit.level ? ` • ${searchHit.level}` : ''}
              {searchHit.title ? ` • ${searchHit.title}` : ''}
              {searchHit.created_at ? ` • ${new Date(searchHit.created_at).toLocaleString()}` : ''}
            </div>
            <div className="mt-3">
              <button
                onClick={() => onPick(searchHit.assistant_id)}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-500 transition"
              >
                Send connection request
              </button>
            </div>
          </div>
        )}

        {/* Directory of other users' agents (self filtered out) */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-semibold text-purple-100">Available agents</h5>
            {loadingDir ? (
              <span className="text-[11px] text-purple-300/70">Loading…</span>
            ) : (
              <span className="text-[11px] text-purple-300/70">{dir.length} shown</span>
            )}
          </div>

          {loadingDir ? (
            <div className="mt-2 text-sm text-purple-300/80">Fetching directory…</div>
          ) : dir.length === 0 ? (
            <div className="mt-2 text-sm text-purple-300/80">No agents published yet.</div>
          ) : (
            <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-blue-800">
              <table className="w-full text-sm">
                <thead className="bg-blue-900/60 text-purple-200 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Agent</th>
                    <th className="text-left p-2">Owner</th>
                    <th className="text-left p-2">Project</th>
                    <th className="text-left p-2">Level</th>
                    <th className="text-right p-2">Pick</th>
                  </tr>
                </thead>
                <tbody>
                  {dir.map((r) => (
                    <tr key={r.assistant_id} className="border-t border-blue-800">
                      <td className="p-2 font-mono text-xs break-all">{r.assistant_id}</td>
                      <td className="p-2 text-purple-100/90">{r.owner_username ? `@${r.owner_username}` : '—'}</td>
                      <td className="p-2 text-purple-100/90">{r.project_name || '—'}</td>
                      <td className="p-2 text-purple-100/90">{r.level || '—'}</td>
                      <td className="p-2 text-right">
                        <button
                          className="px-2.5 py-1 rounded-md bg-teal-500 text-white text-xs hover:bg-teal-400"
                          onClick={() => onPick(r.assistant_id)}
                        >
                          Connect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* tiny hint if we had to fall back to user_projects */}
        {!loadingDir && dir.length <= myAgentIds.length && (
          <div className="mt-3 text-[11px] text-purple-300/70">
            Tip: to list other users’ agents reliably, use the public <code>agent_directory</code> view or the
            <code>agents_registry</code> table with <code>is_listed=true</code>.
          </div>
        )}
      </div>
    </div>
  );
}
