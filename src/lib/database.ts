import { supabase } from './supabase';
import type {
  TeamHead, SurveyProject, SurveySlot, Enumerator,
  SurveyRoom, VehicleCapture, VehicleCount, ChatMessage, SlotCompletion, SurveyNotification, NotificationType,
} from './types';

// --- Team Head ---

export async function getTeamHead(userId: string): Promise<TeamHead | null> {
  const { data, error } = await supabase
    .from('team_heads')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[getTeamHead] Supabase error:', error.message, '| code:', error.code, '| hint:', error.hint);
  }
  console.log('[getTeamHead] user_id=%s found=%s', userId, !!data);
  return data;
}

export async function createTeamHead(
  userId: string,
  fullName: string,
  organization?: string,
  phone?: string
): Promise<TeamHead | null> {
  // ── Verify the active session identity BEFORE the insert ─────────────────
  // auth.uid() inside Supabase RLS must equal the user_id we are inserting.
  // If the session is missing or belongs to a different user the INSERT will
  // be rejected with a 42501 RLS violation.
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData?.session?.user?.id ?? null;
  const accessTokenPreview = sessionData?.session?.access_token
    ? sessionData.session.access_token.slice(0, 24) + '…'
    : null;

  console.log(
    '[createTeamHead] PRE-INSERT auth check',
    '\n  → user_id to insert :', userId,
    '\n  → session user_id   :', sessionUserId,
    '\n  → ids match         :', userId === sessionUserId,
    '\n  → access_token      :', accessTokenPreview ?? 'NONE (unauthenticated)',
  );

  const payload = {
    user_id: userId,
    full_name: fullName,
    organization: organization ?? null,
    phone: phone ?? null,
  };
  console.log('[createTeamHead] INSERT payload:', JSON.stringify(payload));

  const { data, error } = await supabase
    .from('team_heads')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error(
      '[createTeamHead] INSERT FAILED',
      '\n  → message :', error.message,
      '\n  → code    :', error.code,
      '\n  → hint    :', error.hint,
      '\n  → details :', error.details,
      '\n  → full    :', JSON.stringify(error),
    );
    throw error;
  }

  console.log('[createTeamHead] INSERT SUCCESS — team_head id:', data?.id);
  return data;
}
// --- Survey Projects ---

export async function getProjects(teamHeadId: string): Promise<SurveyProject[]> {
  const { data } = await supabase.from('survey_projects').select('*').eq('team_head_id', teamHeadId).order('created_at', { ascending: false });
  return data ?? [];
}

export async function getProject(projectId: string): Promise<SurveyProject | null> {
  const { data } = await supabase.from('survey_projects').select('*').eq('id', projectId).maybeSingle();
  return data;
}

export async function createProject(project: Omit<SurveyProject, 'id' | 'room_code' | 'status' | 'created_at'>): Promise<SurveyProject | null> {
  const { data, error } = await supabase.from('survey_projects').insert(project).select().maybeSingle();
  if (error) {
    console.error('[createProject] Supabase error:', error);
    throw new Error(error.message);
  }
  return data;
}

export async function updateProject(projectId: string, updates: Partial<SurveyProject>): Promise<SurveyProject | null> {
  const { data } = await supabase.from('survey_projects').update(updates).eq('id', projectId).select().maybeSingle();
  return data;
}

// --- Survey Slots ---

export async function getSlots(projectId: string): Promise<SurveySlot[]> {
  const { data, error } = await supabase
    .from('survey_slots')
    .select('*')
    .eq('project_id', projectId)
    .order('slot_number', { ascending: true });

  if (error) {
    console.error('[getSlots] Supabase error for project', projectId, ':', error);
  }
  console.log(
    '[getSlots] project=%s  rows=%d  statuses=[%s]',
    projectId,
    data?.length ?? 0,
    (data ?? []).map((s: SurveySlot) => s.status).join(', ')
  );
  return data ?? [];
}

export async function createSlots(slots: Omit<SurveySlot, 'id' | 'created_at'>[]): Promise<SurveySlot[]> {
  const { data, error } = await supabase.from('survey_slots').insert(slots).select();
  if (error) {
    console.error('[createSlots] Supabase insert error:', error);
    // Throw so callers (SurveyProjectForm) can surface the failure to the user
    // instead of silently creating a project with zero slots.
    throw new Error(`Failed to create time slots: ${error.message}`);
  }
  console.log('[createSlots] Inserted', data?.length ?? 0, 'slots');
  return data ?? [];
}

export async function updateSlot(slotId: string, updates: Partial<SurveySlot>): Promise<SurveySlot | null> {
  const { data } = await supabase.from('survey_slots').update(updates).eq('id', slotId).select().maybeSingle();
  return data;
}

export async function bulkUpdateSlotStatus(projectId: string, statuses: Array<{ slotId: string; status: SurveySlot['status'] }>): Promise<void> {
  if (statuses.length === 0) return;
  await Promise.all(
    statuses.map(({ slotId, status }) =>
      supabase.from('survey_slots').update({ status }).eq('project_id', projectId).eq('id', slotId)
    )
  );
}

// --- Enumerators ---

export async function getEnumerators(projectId: string): Promise<Enumerator[]> {
  const { data } = await supabase.from('enumerators').select('*').eq('project_id', projectId).order('joined_at', { ascending: true });
  return data ?? [];
}

export async function getEnumeratorById(enumId: string): Promise<Enumerator | null> {
  const { data } = await supabase.from('enumerators').select('*').eq('id', enumId).maybeSingle();
  return data;
}

/**
 * Find the first (oldest) enumerator record matching a project + mobile number.
 * Used to detect returning enumerators and prevent duplicate records.
 */
export async function findEnumeratorByMobile(projectId: string, mobile: string): Promise<Enumerator | null> {
  const trimmed = mobile.trim();

  // Try exact match first
  const { data: exact } = await supabase
    .from('enumerators')
    .select('*')
    .eq('project_id', projectId)
    .eq('mobile', trimmed)
    .order('joined_at', { ascending: true })
    .limit(1);
  if (exact?.[0]) return exact[0];

  // Fallback: compare digits only — handles +91XXXXXXXXXX vs XXXXXXXXXX, spaces, dashes, etc.
  const inputDigits = trimmed.replace(/\D/g, '');
  if (inputDigits.length < 7) return null;

  const { data: all } = await supabase
    .from('enumerators')
    .select('*')
    .eq('project_id', projectId)
    .order('joined_at', { ascending: true });

  return (
    all?.find(e => {
      const storedDigits = (e.mobile ?? '').replace(/\D/g, '');
      return (
        storedDigits === inputDigits ||
        storedDigits.endsWith(inputDigits) ||
        inputDigits.endsWith(storedDigits)
      );
    }) ?? null
  );
}

export async function createEnumerator(enumerator: Omit<Enumerator, 'id' | 'joined_at'>): Promise<Enumerator | null> {
  const { data } = await supabase.from('enumerators').insert(enumerator).select().maybeSingle();
  return data;
}

export async function updateEnumerator(enumId: string, updates: Partial<Enumerator>): Promise<Enumerator | null> {
  const { data } = await supabase.from('enumerators').update(updates).eq('id', enumId).select().maybeSingle();
  return data;
}

// --- Survey Rooms ---

export async function getRoomByCode(roomCode: string): Promise<(SurveyRoom & { survey_projects: SurveyProject | null }) | null> {
  const { data } = await supabase.from('survey_rooms').select('*, survey_projects(*)').eq('room_code', roomCode).maybeSingle();
  return data;
}

export async function getRoomForProject(projectId: string): Promise<SurveyRoom | null> {
  const { data } = await supabase.from('survey_rooms').select('*').eq('project_id', projectId).maybeSingle();
  return data;
}

export async function createRoom(room: Omit<SurveyRoom, 'id' | 'created_at'>): Promise<SurveyRoom | null> {
  const { data } = await supabase.from('survey_rooms').insert(room).select().maybeSingle();
  return data;
}

export async function updateRoom(roomId: string, updates: Partial<SurveyRoom>): Promise<SurveyRoom | null> {
  const { data } = await supabase.from('survey_rooms').update(updates).eq('id', roomId).select().maybeSingle();
  return data;
}

// --- Slot Completions ---

export async function getSlotCompletions(projectId: string): Promise<SlotCompletion[]> {
  const { data, error } = await supabase.from('slot_completions').select('*').eq('project_id', projectId);
  if (error) {
    console.error('[getSlotCompletions] Supabase error:', error.message, '| code:', error.code);
  }
  console.log('[getSlotCompletions] project=%s rows=%d', projectId, data?.length ?? 0);
  return data ?? [];
}

export async function upsertSlotCompletion(
  completion: Omit<SlotCompletion, 'id' | 'created_at'>
): Promise<SlotCompletion | null> {
  console.log('[upsertSlotCompletion] Writing:', {
    slot_id: completion.slot_id,
    enumerator_id: completion.enumerator_id,
    status: completion.status,
    completed_at: completion.completed_at,
  });
  const { data, error } = await supabase
    .from('slot_completions')
    .upsert(completion, { onConflict: 'slot_id,enumerator_id' })
    .select()
    .maybeSingle();
  if (error) {
    console.error(
      '[upsertSlotCompletion] Supabase error:', error.message,
      '| code:', error.code,
      '| hint:', error.hint,
      '| details:', error.details,
    );
  } else {
    console.log('[upsertSlotCompletion] Success — saved id:', data?.id);
  }
  return data;
}

// --- Vehicle Captures ---

export async function getCaptures(projectId: string): Promise<VehicleCapture[]> {
  const { data } = await supabase.from('vehicle_captures').select('*').eq('project_id', projectId).order('timestamp', { ascending: true });
  return data ?? [];
}

export async function createCapture(capture: Omit<VehicleCapture, 'id' | 'created_at'>): Promise<VehicleCapture | null> {
  const { data, error } = await supabase.from('vehicle_captures').insert(capture).select().maybeSingle();
  if (error) {
    console.error('[createCapture] Supabase error:', error.message, '| code:', error.code, '| hint:', error.hint);
  }
  return data;
}

export async function updateCapture(captureId: string, updates: Partial<VehicleCapture>): Promise<VehicleCapture | null> {
  const { data } = await supabase.from('vehicle_captures').update(updates).eq('id', captureId).select().maybeSingle();
  return data;
}

// --- Vehicle Counts ---

export async function getCounts(projectId: string): Promise<VehicleCount[]> {
  const { data } = await supabase.from('vehicle_counts').select('*').eq('project_id', projectId);
  return data ?? [];
}

export async function upsertCount(count: Omit<VehicleCount, 'id' | 'created_at'>): Promise<VehicleCount | null> {
  const { data, error } = await supabase.from('vehicle_counts').upsert(count, { onConflict: 'enumerator_id,slot_id' }).select().maybeSingle();
  if (error) {
    console.error('[upsertCount] Supabase error:', error.message, '| code:', error.code);
  }
  return data;
}

// --- Chat Messages ---

export async function getMessages(roomId: string): Promise<ChatMessage[]> {
  const { data } = await supabase.from('chat_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
  return data ?? [];
}

export async function sendMessage(message: Omit<ChatMessage, 'id' | 'created_at'>): Promise<ChatMessage | null> {
  const { data } = await supabase.from('chat_messages').insert(message).select().maybeSingle();
  return data;
}

// --- Notifications ---

export async function getNotifications(projectId: string): Promise<SurveyNotification[]> {
  const { data } = await supabase
    .from('survey_notifications')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function createNotification(
  notification: Omit<SurveyNotification, 'id' | 'created_at' | 'is_read'>
): Promise<SurveyNotification | null> {
  const { data } = await supabase
    .from('survey_notifications')
    .insert({ ...notification, is_read: false })
    .select()
    .maybeSingle();
  return data;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await supabase.from('survey_notifications').update({ is_read: true }).eq('id', notificationId);
}

export async function markAllNotificationsRead(projectId: string): Promise<void> {
  await supabase
    .from('survey_notifications')
    .update({ is_read: true })
    .eq('project_id', projectId)
    .eq('is_read', false);
}

/** Checks whether a notification of this type+slot already exists (dedup guard). */
export async function notificationExists(
  projectId: string,
  type: NotificationType,
  slotId: string | null,
  withinMs: number
): Promise<boolean> {
  const since = new Date(Date.now() - withinMs).toISOString();
  let query = supabase
    .from('survey_notifications')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', type)
    .gte('created_at', since);
  if (slotId) query = query.eq('slot_id', slotId);
  const { data } = await query.limit(1);
  return (data?.length ?? 0) > 0;
}

// --- Storage ---

export async function uploadImage(filePath: string, file: File | Blob): Promise<string | null> {
  const { data, error } = await supabase.storage.from('survey-images').upload(filePath, file, { upsert: true });
  if (error) { console.error('Upload error:', error); return null; }
  const { data: urlData } = supabase.storage.from('survey-images').getPublicUrl(data.path);
  return urlData.publicUrl;
}
