import { useState, useRef, useEffect } from 'react';
import { useScheduleSlots } from '@/hooks/useScheduleSlots';
import { useContents } from '@/hooks/useContents';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, isToday, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import { FileVideo, Calendar, Clock, Trash2, RotateCcw, Lock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface TimelineGraphProps {
  profileId: string;
  platform: string;
  dates: Date[];
  scrollToHour?: number | null;
  highlightContentId?: string | null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimelineGraph({ profileId, platform, dates, scrollToHour, highlightContentId }: TimelineGraphProps) {
  // Use Supabase hooks instead of local store
  const { slots: allSlots } = useScheduleSlots();
  const { contents, updateContent } = useContents();
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  
  const [selectedSlot, setSelectedSlot] = useState<{
    date: Date;
    hour: number;
    contents: typeof contents;
  } | null>(null);
  
  
  // Filter slots by profileId AND platform
  const profileSlots = allSlots.filter(s => 
    s.profile_id === profileId && 
    s.platform === platform && 
    s.is_active
  );
  
  // Get assigned/scheduled/uploaded contents for this profile and platform
  // Include both slot-based content AND manual content (no scheduled_slot_id but has scheduled_at)
  const slotBasedContents = contents.filter(c => 
    c.assigned_profile_id === profileId &&
    c.scheduled_slot_id &&
    (c.status === 'assigned' || c.status === 'scheduled' || c.status === 'uploaded')
  );
  
  // Manual mode content: has scheduled_at but no scheduled_slot_id
  const manualContents = contents.filter(c => 
    c.assigned_profile_id === profileId &&
    !c.scheduled_slot_id &&
    c.scheduled_at &&
    (c.platform === platform || !c.platform) &&  // Match platform or fallback if no platform stored
    (c.status === 'assigned' || c.status === 'scheduled' || c.status === 'uploaded')
  );
  
  const assignedContents = [...slotBasedContents, ...manualContents];
  
  // Get pending contents for scheduling
  const pendingContents = contents.filter(c => c.status === 'pending');
  
  // Auto-scroll effect
  useEffect(() => {
    if (scrollToHour !== null && scrollToHour !== undefined && scrollContainerRef.current) {
      const hourRow = scrollContainerRef.current.querySelector(`[data-hour="${scrollToHour}"]`);
      if (hourRow) {
        setTimeout(() => {
          hourRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [scrollToHour]);
  
  const getSlotForHour = (hour: number): typeof profileSlots[0] | undefined => {
    return profileSlots.find(s => s.hour === hour);
  };
  
  const hasSlotAtHour = (hour: number, date: Date): boolean => {
    const slot = profileSlots.find(s => s.hour === hour);
    if (!slot) return false;
    if (slot.type === 'daily') return true;
    if (slot.type === 'weekly' && slot.week_days) {
      return slot.week_days.includes(date.getDay());
    }
    return false;
  };
  
  // Get all contents for a specific date and hour (supports multiple contents per slot)
  const getContentsForSlot = (date: Date, hour: number): typeof contents => {
    const slot = getSlotForHour(hour);
    
    // Get slot-based contents
    const slotContents = slot ? slotBasedContents.filter(c => {
      if (c.scheduled_slot_id !== slot.id) return false;
      
      // If content has scheduled_at, match by date
      if (c.scheduled_at) {
        const contentDate = new Date(c.scheduled_at);
        return (
          contentDate.getFullYear() === date.getFullYear() &&
          contentDate.getMonth() === date.getMonth() &&
          contentDate.getDate() === date.getDate()
        );
      }
      
      // Legacy: content without scheduled_at shows on first date only (today)
      return isToday(date);
    }) : [];
    
    // Get manual mode contents for this hour (no slot required)
    const manualSlotContents = manualContents.filter(c => {
      if (!c.scheduled_at) return false;
      
      const contentDate = new Date(c.scheduled_at);
      // Convert UTC to local hour for matching
      const contentHour = contentDate.getHours();
      
      return (
        contentDate.getFullYear() === date.getFullYear() &&
        contentDate.getMonth() === date.getMonth() &&
        contentDate.getDate() === date.getDate() &&
        contentHour === hour
      );
    });
    
    return [...slotContents, ...manualSlotContents];
  };
  
  const handleSlotClick = (date: Date, hour: number) => {
    
    const slotContents = getContentsForSlot(date, hour);
    const hasSlot = hasSlotAtHour(hour, date);
    
    // Don't allow interaction with past slots
    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);
    if (isBefore(slotTime, new Date())) return;
    
    // Only open dialog for empty slots with pending content
    if (hasSlot && slotContents.length === 0 && pendingContents.length > 0) {
      setSelectedSlot({ date, hour, contents: [] });
    }
  };
  
  // Double-click handler for content items - opens manage dialog
  const handleContentDoubleClick = (e: React.MouseEvent, date: Date, hour: number, slotContents: typeof contents) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedSlot({ date, hour, contents: slotContents });
  };
  
  const handleAssignContent = (contentId: string) => {
    if (!selectedSlot) return;
    
    const slot = getSlotForHour(selectedSlot.hour);
    if (!slot) return;
    
    // Set scheduled_at to the selected date and time
    const scheduledAt = new Date(selectedSlot.date);
    scheduledAt.setHours(slot.hour, slot.minute, 0, 0);
    
    updateContent.mutate({
      id: contentId,
      assigned_profile_id: profileId,
      scheduled_slot_id: slot.id,
      scheduled_at: scheduledAt.toISOString(),
      status: 'assigned',
    });
    
    setSelectedSlot(null);
    toast.success('Content scheduled');
  };
  
  const handleRemoveFromSchedule = (contentId: string) => {
    updateContent.mutate({
      id: contentId,
      status: 'removed',
      removed_at: new Date().toISOString(),
      removed_from_profile_id: profileId,
      scheduled_slot_id: null,
      scheduled_at: null,
      assigned_profile_id: null,
    });
    setSelectedSlot(null);
    toast.success('Content removed from schedule (moved to trash)');
  };
  
  const handleUnschedule = (contentId: string) => {
    updateContent.mutate({
      id: contentId,
      status: 'pending',
      scheduled_slot_id: null,
      scheduled_at: null,
      assigned_profile_id: null,
    });
    setSelectedSlot(null);
    toast.success('Content unscheduled (back to pending)');
  };
  
  return (
    <div className="space-y-3">
      
      <div className="glass rounded-xl border border-border overflow-hidden">
        {/* Date Headers */}
        <div className="grid grid-cols-[60px_repeat(4,minmax(120px,1fr))] border-b border-border sticky top-0 bg-background z-10">
          <div className="p-4 bg-secondary/30" />
          {dates.map(date => (
            <div 
              key={date.toISOString()}
              className={cn(
                "p-4 text-center border-l border-border",
                isToday(date) && "bg-primary/10"
              )}
            >
              <p className={cn(
                "text-sm font-medium",
                isToday(date) && "text-primary"
              )}>
                {isToday(date) ? 'Today' : format(date, 'EEE')}
              </p>
              <p className="text-lg font-bold">{format(date, 'd')}</p>
              <p className="text-xs text-muted-foreground">{format(date, 'MMM')}</p>
            </div>
          ))}
        </div>
        
        {/* Timeline Grid */}
        <div ref={scrollContainerRef} className="max-h-[600px] overflow-auto scrollbar-thin">
          {HOURS.map(hour => (
            <div 
              key={hour} 
              data-hour={hour}
              className="grid grid-cols-[60px_repeat(4,minmax(120px,1fr))] border-b border-border/50 last:border-b-0"
            >
              {/* Hour Label */}
              <div className="p-2 text-center text-sm text-muted-foreground bg-secondary/20 flex items-center justify-center">
                {hour.toString().padStart(2, '0')}:00
              </div>
              
              {/* Day Slots */}
              {dates.map(date => {
                const slotContents = getContentsForSlot(date, hour);
                const hasSlot = hasSlotAtHour(hour, date);
                const slotTime = new Date(date);
                slotTime.setHours(hour, 0, 0, 0);
                const isPast = isBefore(slotTime, new Date());
                
                return (
                  <div
                    key={`${date.toISOString()}-${hour}`}
                    onClick={() => handleSlotClick(date, hour)}
                    className={cn(
                      "min-h-[50px] border-l border-border/50 p-1 transition-all duration-200",
                      hasSlot && slotContents.length === 0 && !isPast && "bg-timeline-slot cursor-pointer hover:bg-timeline-slot-hover",
                      slotContents.length > 0 && "bg-timeline-slot-filled",
                      isPast && "opacity-50",
                      isToday(date) && "bg-primary/5"
                    )}
                  >
                    {slotContents.length > 0 ? (
                      <div className={cn(
                        "h-full space-y-1 overflow-hidden",
                        slotContents.length > 2 && "max-h-[80px] overflow-y-auto scrollbar-thin"
                      )}>
                        {slotContents.map((content) => {
                          const isLocked = content.is_locked || content.status === 'uploaded';
                          const isUploaded = content.status === 'uploaded';
                          
                          return (
                            <div 
                              key={content.id}
                              title={isLocked ? (isUploaded ? 'Uploaded - cannot be modified' : 'Locked - cannot be modified') : 'Double-click to manage'}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              onDoubleClick={(e) => {
                                if (!isLocked) {
                                  handleContentDoubleClick(e, date, hour, slotContents);
                                }
                              }}
                              style={{ 
                                cursor: isLocked ? 'not-allowed' : isPast ? 'default' : 'pointer',
                                WebkitUserSelect: 'none',
                                userSelect: 'none'
                              }}
                              className={cn(
                                "rounded-md p-1.5 text-xs transition-all duration-200 overflow-hidden",
                                isUploaded 
                                  ? "bg-green-500/20 border border-green-500/40" 
                                  : isLocked 
                                    ? "bg-muted border border-muted-foreground/30 opacity-70" 
                                    : "bg-primary/20 border border-primary/30 hover:bg-primary/30"
                              )}
                            >
                              <div className="flex items-center gap-1">
                                {isUploaded ? (
                                  <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                                ) : isLocked ? (
                                  <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <FileVideo className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                )}
                                <p className="font-medium truncate flex-1" title={content.file_name}>
                                  {content.file_name.length > 10 
                                    ? `${content.file_name.slice(0, 10)}...` 
                                    : content.file_name
                                  }
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        {/* Badge showing count if more than 1 */}
                        {slotContents.length > 1 && (
                          <div className="text-[10px] text-center text-muted-foreground">
                            {slotContents.length} items
                          </div>
                        )}
                      </div>
                    ) : hasSlot && !isPast ? (
                      <div className="h-full flex items-center justify-center text-muted-foreground opacity-0 hover:opacity-100 transition-opacity">
                        <span className="text-xs">Click to add</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        
        {/* Slot Action Dialog */}
        <Dialog open={!!selectedSlot} onOpenChange={() => setSelectedSlot(null)}>
          <DialogContent className="glass border-border !max-w-[470px]">
            <DialogHeader>
              <DialogTitle>
                {selectedSlot?.contents && selectedSlot.contents.length > 0 
                  ? `Manage Content (${selectedSlot.contents.length})` 
                  : 'Add Content'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedSlot && (
              <div className="space-y-4 pt-4 overflow-hidden">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{format(selectedSlot.date, 'EEEE, MMMM d')}</span>
                  <Clock className="w-4 h-4 ml-2" />
                  <span>{selectedSlot.hour.toString().padStart(2, '0')}:00</span>
                </div>
                
                {selectedSlot.contents && selectedSlot.contents.length > 0 ? (
                  <div className="space-y-4 overflow-hidden">
                    <div className="max-h-[390px] overflow-y-auto space-y-3">
                      {selectedSlot.contents.map(content => {
                        // Get actual scheduled time from content
                        const actualTime = content.scheduled_at 
                          ? format(new Date(content.scheduled_at), 'HH:mm')
                          : `${selectedSlot.hour.toString().padStart(2, '0')}:00`;
                        
                        return (
                          <div key={content.id} className="p-2 rounded-lg bg-secondary/30 overflow-hidden">
                            <div className="flex items-start gap-2 overflow-hidden">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <FileVideo className="w-5 h-5 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium truncate text-sm leading-tight" title={content.file_name}>{content.file_name}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2 leading-tight" title={content.caption || 'No caption'}>
                                  {content.caption || 'No caption'}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 mt-2 overflow-hidden">
                              <Button 
                                variant="outline"
                                size="sm"
                                className="flex-1 min-w-0 overflow-hidden"
                                onClick={() => handleUnschedule(content.id)}
                              >
                                <RotateCcw className="w-3 h-3 mr-1 shrink-0" />
                                <span className="truncate">Unschedule</span>
                              </Button>
                              <Button 
                                variant="destructive"
                                size="sm"
                                className="flex-1 min-w-0 overflow-hidden"
                                onClick={() => handleRemoveFromSchedule(content.id)}
                              >
                                <Trash2 className="w-3 h-3 mr-1 shrink-0" />
                                <span className="truncate">Remove</span>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    
                    {/* Option to add more content */}
                    {pendingContents.length > 0 && (
                      <div className="border-t border-border pt-4">
                        <p className="text-sm text-muted-foreground mb-2">Add more content:</p>
                        <div className="space-y-2 max-h-[150px] overflow-y-auto">
                          {pendingContents.slice(0, 3).map(content => (
                            <button
                              key={content.id}
                              onClick={() => handleAssignContent(content.id)}
                              className="w-full p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors flex items-center gap-2 text-left text-sm"
                            >
                              <FileVideo className="w-4 h-4 text-primary flex-shrink-0" />
                              <span className="truncate">{content.file_name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-3">
                      Select content to schedule:
                    </p>
                    {pendingContents.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">
                        No pending content available
                      </p>
                    ) : (
                      pendingContents.map(content => (
                        <button
                          key={content.id}
                          onClick={() => handleAssignContent(content.id)}
                          className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors flex items-center gap-3 text-left"
                        >
                          <FileVideo className="w-5 h-5 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{content.file_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {content.caption || 'No caption'}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
        
      </div>
    </div>
  );
}