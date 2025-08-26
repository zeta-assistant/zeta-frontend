// lib/logs.ts
import { supabase } from '@/lib/supabaseClient';

export type LogActor = 'user' | 'zeta';

export type LogEvent =
  // tasks
  | 'task.create'
  | 'task.edit'
  | 'task.confirm'
  | 'task.complete'
  | 'task.verify'
  // files
  | 'file.upload'
  | 'file.convert'
  | 'file.generate'
  // discussions
  | 'discussion.start'
  // integrations
  | 'api.connect'
  | 'notification.send'
  // calendar
  | 'calendar.event'
  | 'calendar.reminder'
  | 'calendar.note'
  // project meta
  | 'project.vision.update'
  | 'project.goals.short.update'
  | 'project.goals.long.update'
  // zeta-specific thinking/ops
  | 'zeta.thought'
  | 'zeta.outreach'
  // misc
  | 'functions.build.start'
  | 'memory.insight';

export async function logEvent(opts: {
  project_id: string;
  actor: LogActor;
  event: LogEvent;
  message?: string;
  details?: Record<string, any>;
}) {
  const { error } = await supabase.from('system_logs').insert({
    project_id: opts.project_id,
    actor: opts.actor,
    event: opts.event,
    message: opts.message ?? null,
    details: opts.details ?? {},
  });
  if (error) console.error('logEvent error', error);
}

export const logUser = (project_id: string) => ({
  event: (event: LogEvent, details?: Record<string, any>, message?: string) =>
    logEvent({ project_id, actor: 'user', event, details, message }),
});

export const logZeta = (project_id: string) => ({
  event: (event: LogEvent, details?: Record<string, any>, message?: string) =>
    logEvent({ project_id, actor: 'zeta', event, details, message }),
});
