export type MeetingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "live"
  | "ended"
  | "cancelled";

export type ConsultationPriority = "low" | "medium" | "high";

export interface Meeting {
  id: string;
  slug: string;
  title: string;
  hostId: string;
  participantId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  status: MeetingStatus;
  reasonForVisit: string | null;
  priority: ConsultationPriority;
  consultationType: string;
  createdAt: Date;
  updatedAt: Date;
}

// Meeting joined with basic patient/host display info, for list views that
// need to show who the consultation is with without a separate lookup.
export interface MeetingWithParticipants extends Meeting {
  patientName: string | null;
  patientEmail: string | null;
  hostName: string | null;
  hostEmail: string | null;
}

export interface ScheduleMeetingInput {
  title: string;
  hostId: string;
  participantId?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  reasonForVisit?: string;
  priority?: ConsultationPriority;
  consultationType?: string;
}

export const mapRowToMeeting = (row: any): Meeting => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  hostId: row.host_id,
  participantId: row.participant_id,
  scheduledStart: row.scheduled_start,
  scheduledEnd: row.scheduled_end,
  status: row.status,
  reasonForVisit: row.reason_for_visit,
  priority: row.priority,
  consultationType: row.consultation_type,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapRowToMeetingWithParticipants = (row: any): MeetingWithParticipants => ({
  ...mapRowToMeeting(row),
  patientName: row.patient_name,
  patientEmail: row.patient_email,
  hostName: row.host_name,
  hostEmail: row.host_email,
});