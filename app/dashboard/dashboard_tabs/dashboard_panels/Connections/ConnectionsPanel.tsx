'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import NewConnectionModal from './NewConnectionModal';

type Props = { projectId: string };

type ConnRow = {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  status: 'pending' | 'active' | 'rejected' | 'blocked' | 'cancelled';
};

type AgentMsg = {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  message: string;
  created_at: string;
};

const DEFAULT_AVATAR = '/user-faceless.svg';

function levelToTitle(level?: number | null) {
  const n = Number(level ?? 1);
  switch (n) {
    case 1: return 'Junior Assistant';
    case 2: return 'Associate Assistant';
    case 3: return 'Senior Assistant';
    case 4: return 'Lead Assistant';
    case 5: return 'Principal Assistant';
    default: return 'Assistant';
  }
}

export default function ConnectionsPanel({ projectId }: Props) {
  const [projectName, setProjectName] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('');
  const [agentLevel, setAgentLevel] = useState<number>(1);
  const [agentTitle, setAgentTitle] = useState<string>('Assistant');
  const [avatarUrl, setAvatarUrl] = useState<string>(DEFAULT_AVATAR);

  // visibility / listing
  const [isListed, setIsListed] = useState<boolean>(true);
  const [toggling, setToggling] = useState<boolean>(false);

  // connections + inbox
  const [connections, setConnections] = useState<ConnRow[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [inbox, setInbox] = useState<AgentMsg[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);

  // modal + toast
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // avatar from settings
      const { data: { session } } = await supabase.auth.getSession();
      const a = (session?.user?.user_metadata?.profile_image_url as string) || DEFAULT_AVATAR;
      setAvatarUrl(a);

      await loadProjectAndAgent();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadProjectAndAgent() {
    // 1) try user_projects (authoritative for the current project)
    const { data: proj } = await supabase
      .from('user_projects')
      .select('id, name, assistant_id, agent_level, agent_title')
      .eq('id', projectId)
      .maybeSingle();

    if (proj) {
      if (proj.name) setProjectName(proj.name);
      if (proj.assistant_id) setAgentId(proj.assistant_id);

      const lvl = (proj as any).agent_level ?? 1;
      setAgentLevel(lvl);
      setAgentTitle(levelToTitle(lvl));
    }

    // 2) if agent_id or name still missing, fall back to agents_registry by project_id
    if (!proj?.assistant_id || !proj?.name) {
      const { data: regByProj } = await supabase
        .from('agents_registry')
        .select('assistant_id, project_name, agent_level, title, is_listed')
        .eq('project_id', projectId)
        .maybeSingle();

      if (regByProj) {
        if (!proj?.assistant_id && regByProj.assistant_id) setAgentId(regByProj.assistant_id);
        if (!proj?.name && regByProj.project_name) setProjectName(regByProj.project_name);
        if (regByProj.agent_level != null) {
          setAgentLevel(regByProj.agent_level);
          setAgentTitle(levelToTitle(regByProj.agent_level));
        }
        if (regByProj.is_listed != null) setIsListed(!!regByProj.is_listed);
      }
    }

    // 3) read visibility from registry by assistant if we have it
    if (agentId || proj?.assistant_id) {
      const aId = agentId || (proj?.assistant_id as string);
      const { data: reg } = await supabase
        .from('agents_registry')
        .select('is_listed, agent_level, title')
        .eq('assistant_id', aId)
        .maybeSingle();

      if (reg) {
        if (reg.agent_level != null) {
          setAgentLevel(reg.agent_level);
          setAgentTitle(levelToTitle(reg.agent_level));
        }
        if (reg.is_listed != null) setIsListed(!!reg.is_listed);
      }
      await Promise.all([fetchConnections(aId), fetchAgentInbox(aId)]);
    }
  }

  async function fetchConnections(myAgentId: string) {
    setLoadingConnections(true);
    try {
      const { data } = await supabase
        .from('agent_connections')
        .select('id, from_agent_id, to_agent_id, status')
        .or(`from_agent_id.eq.${myAgentId},to_agent_id.eq.${myAgentId}`)
        .order('created_at', { ascending: false });
      setConnections((data as any[]) || []);
    } finally {
      setLoadingConnections(false);
    }
  }

  async function fetchAgentInbox(myAgentId: string) {
    setLoadingInbox(true);
    try {
      const { data } = await supabase
        .from('agent_messages')
        .select('id, from_agent_id, to_agent_id, message, created_at')
        .or(`from_agent_id.eq.${myAgentId},to_agent_id.eq.${myAgentId}`)
        .order('created_at', { ascending: false })
        .limit(50);
      setInbox((data as any[]) || []);
    } catch {
      setInbox([]); // table might not exist yet
    } finally {
      setLoadingInbox(false);
    }
  }

  async function handleCreateConnection(targetAssistantId: string) {
    if (!agentId) {
      setToast('This project has no agent yet.');
      setTimeout(() => setToast(null), 2200);
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('Not signed in');
      const { error } = await supabase.from('agent_connections').insert({
        from_agent_id: agentId,
        to_agent_id: targetAssistantId,
        requested_by: session.user.id,
        status: 'pending',
      });
      if (error) throw error;
      setToast('Connection request sent.');
      setOpen(false);
      await fetchConnections(agentId);
    } catch (e: any) {
      setToast(e?.message || 'Failed to send request.');
    } finally {
      setTimeout(() => setToast(null), 2200);
    }
  }

  async function toggleVisibility() {
    if (!agentId) return;
    setToggling(true);
    const newVal = !isListed;

    try {
      // update; if missing, upsert from project snapshot
      const { error, data } = await supabase
        .from('agents_registry')
        .update({ is_listed: newVal })
        .eq('assistant_id', agentId)
        .select('assistant_id');

      if (error || (data?.length ?? 0) === 0) {
        const { data: proj } = await supabase
          .from('user_projects')
          .select('id, user_id, name')
          .eq('id', projectId)
          .single();

        await supabase.from('agents_registry').upsert({
          assistant_id: agentId,
          user_id: proj?.user_id,
          project_id: projectId,
          project_name: proj?.name ?? null,
          title: levelToTitle(agentLevel),
          agent_level: agentLevel,
          is_listed: newVal,
        }, { onConflict: 'assistant_id' });
      }

      setIsListed(newVal);
    } catch {
      setToast('Failed to update visibility.');
      setTimeout(() => setToast(null), 2000);
    } finally {
      setToggling(false);
    }
  }

  const headerLabel = projectName ? `${projectName}’s Agent` : 'Project Agent';

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Project Agent card */}
      <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-purple-100">{headerLabel}</h2>

          {/* Visibility toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-purple-100">Visibility</span>
            <button
              role="switch"
              aria-checked={isListed}
              onClick={toggleVisibility}
              disabled={toggling}
              className={[
                'relative inline-flex h-6 w-11 items-center rounded-full transition',
                isListed ? 'bg-teal-500' : 'bg-blue-700',
                toggling ? 'opacity-70' : '',
              ].join(' ')}
              title={isListed ? 'Discoverable' : 'Hidden'}
            >
              <span
                className={[
                  'inline-block h-5 w-5 transform rounded-full bg-white transition',
                  isListed ? 'translate-x-5' : 'translate-x-1',
                ].join(' ')}
              />
            </button>
            <span className="text-xs text-purple-300/80">
              {isListed ? 'Discoverable' : 'Hidden'}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-4">
          {/* avatar */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl || DEFAULT_AVATAR}
            alt="User avatar"
            className="w-20 h-20 rounded-xl border border-blue-800 object-cover bg-blue-900"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
          />

          {/* details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
            <div className="rounded-xl border border-blue-800 bg-blue-900/40 p-3">
              <div className="text-[11px] text-purple-300/70">Agent ID</div>
              <div className="font-mono text-sm text-purple-100 break-all">{agentId || '—'}</div>
            </div>

            <div className="rounded-xl border border-blue-800 bg-blue-900/40 p-3">
              <div className="text-[11px] text-purple-300/70">Type</div>
              <div className="text-sm text-purple-100">Zeta</div>
            </div>

            <div className="rounded-xl border border-blue-800 bg-blue-900/40 p-3">
              <div className="text-[11px] text-purple-300/70">Agent Title</div>
              <div className="text-sm text-purple-100">{agentTitle}</div>
            </div>

            <div className="rounded-xl border border-blue-800 bg-blue-900/40 p-3">
              <div className="text-[11px] text-purple-300/70">Project Title</div>
              <div className="text-sm text-purple-100">{projectName || '—'}</div>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-purple-300/70">
          Only <span className="font-semibold">Type (Zeta)</span>, <span className="font-semibold">Agent Title</span>, and <span className="font-semibold">Project Title</span> are visible to others.
        </p>
      </div>

      {/* Connections */}
      <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-purple-100">Connections</h3>
          <button
            onClick={() => setOpen(true)}
            className="px-3 py-1.5 rounded-md bg-teal-500 text-white text-sm hover:bg-teal-400 transition"
          >
            Add connection
          </button>
        </div>

        {loadingConnections ? (
          <div className="mt-3 text-sm text-purple-300/80">Loading connections…</div>
        ) : connections.length === 0 ? (
          <div className="mt-3 text-sm text-purple-300/80">No connections yet.</div>
        ) : (
          <ul className="mt-3 space-y-2">
            {connections.map((c) => {
              const other = c.from_agent_id === agentId ? c.to_agent_id : c.from_agent_id;
              return (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-blue-800 bg-blue-900/40 px-3 py-2">
                  <div className="text-sm text-purple-100">Connected with <span className="font-mono">{other.slice(0, 12)}…</span></div>
                  <span className={[
                    'text-[11px] px-2 py-0.5 rounded-full border',
                    c.status === 'active' ? 'border-emerald-400 text-emerald-300' : 'border-amber-300 text-amber-300',
                  ].join(' ')}>{c.status}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Agent Inbox */}
      <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-purple-100">Agent Inbox</h3>
          <div className="text-[11px] text-purple-300/70">Messages to / from this agent</div>
        </div>

        {loadingInbox ? (
          <div className="mt-3 text-sm text-purple-300/80">Loading messages…</div>
        ) : inbox.length === 0 ? (
          <div className="mt-3 text-sm text-purple-300/80">No agent messages yet.</div>
        ) : (
          <ul className="mt-3 space-y-2">
            {inbox.map((m) => {
              const outgoing = m.from_agent_id === agentId;
              return (
                <li key={m.id} className="rounded-lg border border-blue-800 bg-blue-900/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-purple-300/70">{new Date(m.created_at).toLocaleString()}</div>
                    <div className="text-[11px] text-purple-300/70 font-mono">
                      {outgoing ? <>Sent → {m.to_agent_id.slice(0, 12)}…</> : <>Received ← {m.from_agent_id.slice(0, 12)}…</>}
                    </div>
                  </div>
                  <div className="text-sm text-purple-100 mt-1 whitespace-pre-wrap">{m.message}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal */}
      {open && (
        <NewConnectionModal
          onClose={() => setOpen(false)}
          onPick={(assistantId) => handleCreateConnection(assistantId)}
        />
      )}

      {/* toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-blue-950 border border-blue-700 text-purple-100 text-sm px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
