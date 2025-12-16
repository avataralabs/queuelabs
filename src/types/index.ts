export type Platform = 'tiktok' | 'instagram' | 'youtube';

export interface Profile {
  id: string;
  name: string;
  platform: Platform;
  createdAt: Date;
}

export interface ScheduleSlot {
  id: string;
  profileId: string;
  hour: number;
  minute: number;
  isActive: boolean;
  type: 'daily' | 'weekly';
  weekDays?: number[]; // 0-6 for Sunday-Saturday
}

export interface Content {
  id: string;
  fileName: string;
  caption: string;
  fileSize: number;
  uploadedAt: Date;
  assignedProfileId?: string;
  scheduledAt?: Date;
  scheduledSlotId?: string;
  status: 'pending' | 'assigned' | 'scheduled' | 'uploaded' | 'failed';
}

export interface ScheduledContent {
  id: string;
  contentId: string;
  profileId: string;
  slotId: string;
  scheduledDate: Date;
  hour: number;
  minute: number;
}

export interface DaySchedule {
  date: Date;
  slots: {
    slot: ScheduleSlot;
    content?: Content;
    scheduledContent?: ScheduledContent;
  }[];
}

export interface UploadHistory {
  id: string;
  contentId: string;
  profileId: string;
  uploadedAt: Date;
  status: 'success' | 'failed';
  errorMessage?: string;
}
