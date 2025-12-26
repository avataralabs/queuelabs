import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Profile, Content, ScheduleSlot, ScheduledContent, UploadHistory, Platform } from '@/types';

interface AppState {
  profiles: Profile[];
  contents: Content[];
  scheduleSlots: ScheduleSlot[];
  scheduledContents: ScheduledContent[];
  uploadHistory: UploadHistory[];
  
  // Profile actions
  addProfile: (profile: Omit<Profile, 'id' | 'createdAt'>) => void;
  updateProfile: (id: string, updates: Partial<Profile>) => void;
  deleteProfile: (id: string) => void;
  
  // Content actions
  addContent: (content: Omit<Content, 'id' | 'uploadedAt' | 'status'>) => void;
  updateContent: (id: string, updates: Partial<Content>) => void;
  deleteContent: (id: string) => void;
  assignContentToProfile: (contentId: string, profileId: string) => void;
  
  // Schedule slot actions
  addScheduleSlot: (slot: Omit<ScheduleSlot, 'id'>) => void;
  updateScheduleSlot: (id: string, updates: Partial<ScheduleSlot>) => void;
  deleteScheduleSlot: (id: string) => void;
  
  // Scheduled content actions
  scheduleContent: (contentId: string, profileId: string, slotId: string, date: Date, hour: number, minute: number) => void;
  moveScheduledContent: (scheduledContentId: string, newDate: Date, newHour: number, newMinute: number) => void;
  swapScheduledContents: (scId1: string, scId2: string) => void;
  unscheduleContent: (scheduledContentId: string) => void;
  removeFromSchedule: (scheduledContentId: string) => void;
  restoreRemovedContent: (contentId: string) => void;
  permanentDeleteContent: (contentId: string) => void;
  
  // History actions
  addToHistory: (entry: Omit<UploadHistory, 'id'>) => void;
  
  // Utility
  getProfileById: (id: string) => Profile | undefined;
  getContentById: (id: string) => Content | undefined;
  getSlotsByProfile: (profileId: string) => ScheduleSlot[];
  getScheduledContentForDate: (profileId: string, date: Date) => ScheduledContent[];
  getPendingContents: () => Content[];
  getAssignedContents: () => Content[];
  getRemovedContents: () => Content[];
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profiles: [],
      contents: [],
      scheduleSlots: [],
      scheduledContents: [],
      uploadHistory: [],
      
      // Profile actions
      addProfile: (profile) => set((state) => ({
        profiles: [...state.profiles, {
          ...profile,
          id: generateId(),
          createdAt: new Date(),
        }]
      })),
      
      updateProfile: (id, updates) => set((state) => ({
        profiles: state.profiles.map(p => p.id === id ? { ...p, ...updates } : p)
      })),
      
      deleteProfile: (id) => set((state) => ({
        profiles: state.profiles.filter(p => p.id !== id),
        scheduleSlots: state.scheduleSlots.filter(s => s.profileId !== id),
        scheduledContents: state.scheduledContents.filter(sc => sc.profileId !== id),
      })),
      
      // Content actions
      addContent: (content) => set((state) => ({
        contents: [...state.contents, {
          ...content,
          id: generateId(),
          uploadedAt: new Date(),
          status: 'pending',
        }]
      })),
      
      updateContent: (id, updates) => set((state) => ({
        contents: state.contents.map(c => c.id === id ? { ...c, ...updates } : c)
      })),
      
      deleteContent: (id) => set((state) => ({
        contents: state.contents.filter(c => c.id !== id),
        scheduledContents: state.scheduledContents.filter(sc => sc.contentId !== id),
      })),
      
      assignContentToProfile: (contentId, profileId) => {
        const state = get();
        const slots = state.scheduleSlots.filter(s => s.profileId === profileId && s.isActive);
        
        if (slots.length === 0) {
          set((state) => ({
            contents: state.contents.map(c => 
              c.id === contentId 
                ? { ...c, assignedProfileId: profileId, status: 'assigned' as const }
                : c
            )
          }));
          return;
        }
        
        // Find next available slot
        const now = new Date();
        let targetDate = new Date(now);
        let found = false;
        
        for (let dayOffset = 0; dayOffset < 30 && !found; dayOffset++) {
          const checkDate = new Date(now);
          checkDate.setDate(checkDate.getDate() + dayOffset);
          
          for (const slot of slots.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))) {
            // Check if this slot type allows this day
            if (slot.type === 'weekly' && slot.weekDays && !slot.weekDays.includes(checkDate.getDay())) {
              continue;
            }
            
            const slotTime = new Date(checkDate);
            slotTime.setHours(slot.hour, slot.minute, 0, 0);
            
            // Skip if slot time has passed today
            if (dayOffset === 0 && slotTime <= now) {
              continue;
            }
            
            // Check if slot is already taken
            const existingSchedule = state.scheduledContents.find(sc => 
              sc.profileId === profileId &&
              sc.slotId === slot.id &&
              new Date(sc.scheduledDate).toDateString() === checkDate.toDateString()
            );
            
            if (!existingSchedule) {
              targetDate = checkDate;
              
              set((state) => ({
                contents: state.contents.map(c => 
                  c.id === contentId 
                    ? { 
                        ...c, 
                        assignedProfileId: profileId, 
                        status: 'scheduled' as const,
                        scheduledAt: slotTime,
                        scheduledSlotId: slot.id 
                      }
                    : c
                ),
                scheduledContents: [...state.scheduledContents, {
                  id: generateId(),
                  contentId,
                  profileId,
                  slotId: slot.id,
                  scheduledDate: slotTime,
                  hour: slot.hour,
                  minute: slot.minute,
                }]
              }));
              
              found = true;
              break;
            }
          }
        }
        
        if (!found) {
          set((state) => ({
            contents: state.contents.map(c => 
              c.id === contentId 
                ? { ...c, assignedProfileId: profileId, status: 'assigned' as const }
                : c
            )
          }));
        }
      },
      
      // Schedule slot actions
      addScheduleSlot: (slot) => set((state) => ({
        scheduleSlots: [...state.scheduleSlots, { ...slot, id: generateId() }]
      })),
      
      updateScheduleSlot: (id, updates) => set((state) => ({
        scheduleSlots: state.scheduleSlots.map(s => s.id === id ? { ...s, ...updates } : s)
      })),
      
      deleteScheduleSlot: (id) => set((state) => ({
        scheduleSlots: state.scheduleSlots.filter(s => s.id !== id),
      })),
      
      // Scheduled content actions
      scheduleContent: (contentId, profileId, slotId, date, hour, minute) => {
        const scheduledDate = new Date(date);
        scheduledDate.setHours(hour, minute, 0, 0);
        
        set((state) => ({
          scheduledContents: [...state.scheduledContents, {
            id: generateId(),
            contentId,
            profileId,
            slotId,
            scheduledDate,
            hour,
            minute,
          }],
          contents: state.contents.map(c => 
            c.id === contentId 
              ? { 
                  ...c, 
                  status: 'scheduled' as const,
                  scheduledAt: scheduledDate,
                  scheduledSlotId: slotId,
                  assignedProfileId: profileId,
                }
              : c
          )
        }));
      },
      
      moveScheduledContent: (scheduledContentId, newDate, newHour, newMinute) => {
        const scheduledDate = new Date(newDate);
        scheduledDate.setHours(newHour, newMinute, 0, 0);
        
        set((state) => {
          const sc = state.scheduledContents.find(s => s.id === scheduledContentId);
          if (!sc) return state;
          
          return {
            scheduledContents: state.scheduledContents.map(s => 
              s.id === scheduledContentId 
                ? { ...s, scheduledDate, hour: newHour, minute: newMinute }
                : s
            ),
            contents: state.contents.map(c => 
              c.id === sc.contentId 
                ? { ...c, scheduledAt: scheduledDate }
                : c
            )
          };
        });
      },
      
      unscheduleContent: (scheduledContentId) => set((state) => {
        const sc = state.scheduledContents.find(s => s.id === scheduledContentId);
        if (!sc) return state;
        
        return {
          scheduledContents: state.scheduledContents.filter(s => s.id !== scheduledContentId),
          contents: state.contents.map(c => 
            c.id === sc.contentId 
              ? { ...c, status: 'assigned' as const, scheduledAt: undefined, scheduledSlotId: undefined }
              : c
          )
        };
      }),
      
      removeFromSchedule: (scheduledContentId) => set((state) => {
        const sc = state.scheduledContents.find(s => s.id === scheduledContentId);
        if (!sc) return state;
        
        return {
          scheduledContents: state.scheduledContents.filter(s => s.id !== scheduledContentId),
          contents: state.contents.map(c => 
            c.id === sc.contentId 
              ? { 
                  ...c, 
                  status: 'removed' as const, 
                  scheduledAt: undefined, 
                  scheduledSlotId: undefined,
                  removedAt: new Date(),
                  removedFromProfileId: sc.profileId
                }
              : c
          )
        };
      }),
      
      swapScheduledContents: (scId1, scId2) => set((state) => {
        const sc1 = state.scheduledContents.find(s => s.id === scId1);
        const sc2 = state.scheduledContents.find(s => s.id === scId2);
        if (!sc1 || !sc2) return state;
        
        return {
          scheduledContents: state.scheduledContents.map(sc => {
            if (sc.id === scId1) {
              return { 
                ...sc, 
                scheduledDate: sc2.scheduledDate, 
                hour: sc2.hour, 
                minute: sc2.minute,
                slotId: sc2.slotId
              };
            }
            if (sc.id === scId2) {
              return { 
                ...sc, 
                scheduledDate: sc1.scheduledDate, 
                hour: sc1.hour, 
                minute: sc1.minute,
                slotId: sc1.slotId
              };
            }
            return sc;
          }),
          contents: state.contents.map(c => {
            if (c.id === sc1.contentId) {
              const newDate = new Date(sc2.scheduledDate);
              newDate.setHours(sc2.hour, sc2.minute, 0, 0);
              return { ...c, scheduledAt: newDate };
            }
            if (c.id === sc2.contentId) {
              const newDate = new Date(sc1.scheduledDate);
              newDate.setHours(sc1.hour, sc1.minute, 0, 0);
              return { ...c, scheduledAt: newDate };
            }
            return c;
          })
        };
      }),
      
      restoreRemovedContent: (contentId) => set((state) => ({
        contents: state.contents.map(c => 
          c.id === contentId 
            ? { ...c, status: 'pending' as const, removedAt: undefined, removedFromProfileId: undefined, assignedProfileId: undefined }
            : c
        )
      })),
      
      permanentDeleteContent: (contentId) => set((state) => ({
        contents: state.contents.filter(c => c.id !== contentId),
        scheduledContents: state.scheduledContents.filter(sc => sc.contentId !== contentId),
      })),
      
      // History actions
      addToHistory: (entry) => set((state) => ({
        uploadHistory: [...state.uploadHistory, { ...entry, id: generateId() }]
      })),
      
      // Utility
      getProfileById: (id) => get().profiles.find(p => p.id === id),
      getContentById: (id) => get().contents.find(c => c.id === id),
      getSlotsByProfile: (profileId) => get().scheduleSlots.filter(s => s.profileId === profileId),
      getScheduledContentForDate: (profileId, date) => {
        const dateStr = new Date(date).toDateString();
        return get().scheduledContents.filter(sc => 
          sc.profileId === profileId && 
          new Date(sc.scheduledDate).toDateString() === dateStr
        );
      },
      getPendingContents: () => get().contents.filter(c => c.status === 'pending'),
      getAssignedContents: () => get().contents.filter(c => c.status === 'assigned' || c.status === 'scheduled'),
      getRemovedContents: () => get().contents.filter(c => c.status === 'removed'),
    }),
    {
      name: 'queuelabs-storage',
      partialize: (state) => ({
        profiles: state.profiles,
        contents: state.contents,
        scheduleSlots: state.scheduleSlots,
        scheduledContents: state.scheduledContents,
        uploadHistory: state.uploadHistory,
      }),
    }
  )
);
