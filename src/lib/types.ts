export type UserRole = 'team_head' | 'enumerator' | 'admin';

export interface TeamHead {
  id: string;
  user_id: string;
  full_name: string;
  organization: string | null;
  phone: string | null;
  created_at: string;
}

export interface SurveyProject {
  id: string;
  team_head_id: string;
  project_name: string;
  client_name: string | null;
  purpose: string | null;
  survey_date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  boundary_polygon: Array<{ lat: number; lng: number }> | null;
  area_size_sqm: number | null;
  num_enumerators: number;
  vehicle_categories: string[];
  survey_duration_hours: number;
  survey_interval_minutes: number;
  grace_period_minutes: number;
  num_slots: number | null;
  room_code: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface SurveySlot {
  id: string;
  project_id: string;
  slot_number: number;
  /** Planned start time (HH:MM:SS) */
  start_time: string;
  /** Planned end time (HH:MM:SS) */
  end_time: string;
  /** Break duration (minutes) after this slot before the next one starts. 0 for last slot. */
  break_after_minutes: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  actual_started_at: string | null;
  actual_completed_at: string | null;
  started_by: string | null;
  completed_by: string | null;
  completion_reason: string | null;
  created_at: string;
}

export type NotificationType =
  | 'upcoming_slot'
  | 'slot_not_started'
  | 'slot_ending_soon'
  | 'survey_completed'
  | 'survey_paused'
  | 'survey_resumed';

export interface SurveyNotification {
  id: string;
  project_id: string;
  team_head_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  slot_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SlotCompletion {
  id: string;
  project_id: string;
  slot_id: string;
  enumerator_id: string;
  status: 'pending' | 'completed';
  completed_at: string | null;
  created_at: string;
}

export interface Enumerator {
  id: string;
  project_id: string;
  name: string;
  mobile: string;
  email: string | null;
  enumerator_code: string;
  assigned_lat: number | null;
  assigned_lng: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  is_online: boolean;
  battery_level: number | null;
  network_status: string;
  camera_permission: boolean;
  last_heartbeat: string | null;
  joined_at: string;
}

export interface SurveyRoom {
  id: string;
  project_id: string;
  room_code: string;
  is_active: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface VehicleCapture {
  id: string;
  project_id: string;
  enumerator_id: string;
  slot_id: string;
  image_url: string | null;
  thumbnail_url: string | null;
  timestamp: string;
  gps_lat: number | null;
  gps_lng: number | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  ai_count_result: number | null;
  ai_confidence: number | null;
  manual_count: number;
  is_verified: boolean;
  /** 'ML Detection' | 'Manual Entry' */
  source?: string | null;
  notes?: string | null;
  /** Plate Recognizer enrichment fields (migration 009) */
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  /** 0–1 confidence from Plate Recognizer for the plate reading */
  plate_confidence?: number | null;
  /** Raw Plate Recognizer type: Sedan, SUV, Hatchback, Pickup, Van, Motorcycle … */
  detailed_vehicle_type?: string | null;
  created_at: string;
}

export interface VehicleCount {
  id: string;
  project_id: string;
  enumerator_id: string;
  slot_id: string;
  two_wheeler: number;
  car: number;
  auto: number;
  bus: number;
  truck: number;
  lcv: number;
  others: number;
  total: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_type: 'team_head' | 'enumerator';
  sender_id: string;
  message: string;
  is_emergency: boolean;
  created_at: string;
}

export interface AdminUser {
  id: string;
  user_id: string;
  full_name: string;
  role: 'super_admin' | 'admin';
  created_at: string;
}

export const VEHICLE_CATEGORIES = [
  { key: 'two_wheeler', label: 'Two Wheeler', color: '#3B82F6' },
  { key: 'car', label: 'Car', color: '#10B981' },
  { key: 'auto', label: 'Auto', color: '#F59E0B' },
  { key: 'bus', label: 'Bus', color: '#EF4444' },
  { key: 'truck', label: 'Truck', color: '#8B5CF6' },
  { key: 'lcv', label: 'LCV', color: '#EC4899' },
  { key: 'others', label: 'Others', color: '#6B7280' },
] as const;

export const VEHICLE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  VEHICLE_CATEGORIES.map(c => [c.key, c.label])
);
