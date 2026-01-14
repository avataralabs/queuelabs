import { useState, useRef, useEffect, useCallback } from 'react';
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
import { FileVideo, Calendar, Clock, Trash2, RotateCcw, GripVertical, Lock, CheckCircle } from 'lucide-react';
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
  
  const [draggedItem, setDraggedItem] = useState<typeof contents[0] | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: Date; hour: number } | null>(null);
  const [lastDroppedId, setLastDroppedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragIntent, setIsDragIntent] = useState(false);
  
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
    if (isDragging || draggedItem) return; // Don't open dialog while dragging
    
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
  
  // Drag and Drop handlers
  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, content: typeof contents[0]) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', content.id);
    
    // Create transparent 1x1 image to hide default drag ghost
    const emptyImg = document.createElement('img');
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
    
    setIsDragIntent(true);
    setIsDragging(true);
    setDraggedItem(content);
    setDragPosition({ x: e.clientX, y: e.clientY });
  }, []);
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDraggedItem(null);
    setDragOverSlot(null);
    setDragPosition(null);
    setIsDragIntent(false);
  }, []);
  
  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Browser sends 0,0 at start and end of drag - ignore these
    if (e.clientX === 0 && e.clientY === 0) return;
    
    requestAnimationFrame(() => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    });
  }, []);
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, date: Date, hour: number) => {
    e.preventDefault();
    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);
    
    // Don't allow drop on past slots
    if (isBefore(slotTime, new Date())) return;
    
    const hasSlot = hasSlotAtHour(hour, date);
    if (!hasSlot) return;
    
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot({ date, hour });
  };
  
  const handleDragLeave = () => {
    setDragOverSlot(null);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, date: Date, hour: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    
    if (!draggedItem) return;
    
    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);
    if (isBefore(slotTime, new Date())) return;
    
    const targetSlot = getSlotForHour(hour);
    if (!targetSlot) return;
    
    // Check if dropping to the same slot and same date - skip if so
    const sourceSlotId = draggedItem.scheduled_slot_id;
    const sourceDate = draggedItem.scheduled_at ? new Date(draggedItem.scheduled_at) : null;
    
    if (sourceSlotId === targetSlot.id && sourceDate) {
      const isSameDate = 
        sourceDate.getFullYear() === date.getFullYear() &&
        sourceDate.getMonth() === date.getMonth() &&
        sourceDate.getDate() === date.getDate();
      
      if (isSameDate) {
        setDraggedItem(null);
        return; // Don't do anything if dropping to the same slot
      }
    }
    
    // Create new scheduled_at with target date and slot time
    const newScheduledAt = new Date(date);
    newScheduledAt.setHours(targetSlot.hour, targetSlot.minute, 0, 0);
    
    // Simply move to the new slot (allows stacking multiple contents)
    updateContent.mutate({
      id: draggedItem.id,
      scheduled_slot_id: targetSlot.id,
      scheduled_at: newScheduledAt.toISOString(),
    });
    
    toast.success('Content moved');
    setDraggedItem(null);
    
    // Success flash animation
    setLastDroppedId(draggedItem.id);
    setTimeout(() => setLastDroppedId(null), 1000);
  };
  
  return (
    <div className="space-y-3">
      {/* Drag Indicator */}
      {draggedItem && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/40 shadow-md animate-fade-in">
          <div className="flex items-center gap-3 text-primary">
            <div className="w-8 h-8 rounded bg-primary/30 flex items-center justify-center">
              <GripVertical className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-medium block">Moving: {draggedItem.file_name}</span>
              <span className="text-xs text-muted-foreground">Drop on any available slot</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleDragEnd}>
            Cancel
          </Button>
        </div>
      )}
      
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
                const isDragOver = dragOverSlot?.date.toISOString() === date.toISOString() && dragOverSlot?.hour === hour;
                const hasDraggedItemHere = slotContents.some(c => c.id === draggedItem?.id);
                
                return (
                  <div
                    key={`${date.toISOString()}-${hour}`}
                    onClick={() => handleSlotClick(date, hour)}
                    onDragOver={(e) => handleDragOver(e, date, hour)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, date, hour)}
                    className={cn(
                      "min-h-[50px] border-l border-border/50 p-1 transition-all duration-200",
                      hasSlot && slotContents.length === 0 && !isPast && "bg-timeline-slot cursor-pointer hover:bg-timeline-slot-hover",
                      slotContents.length > 0 && "bg-timeline-slot-filled",
                      isPast && "opacity-50",
                      isToday(date) && "bg-primary/5",
                      isDragOver && !hasDraggedItemHere && "ring-2 ring-primary bg-primary/20 scale-[1.02] animate-pulse",
                      isDragOver && slotContents.length > 0 && !hasDraggedItemHere && "ring-2 ring-amber-400 bg-amber-100/50 scale-[1.02] animate-pulse"
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
                          const canDrag = !isPast && !isLocked;
                          
                          return (
                            <div 
                              key={content.id}
                              draggable={canDrag}
                              title={isLocked ? (isUploaded ? 'Uploaded - cannot be modified' : 'Locked - cannot be modified') : 'Double-click to manage, drag to move'}
                              onMouseDown={(e) => {
                                if (isPast || isLocked) return;
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isDragIntent) {
                                  setIsDragIntent(false);
                                }
                              }}
                              onDoubleClick={(e) => {
                                if (!isDragIntent && !isLocked) {
                                  handleContentDoubleClick(e, date, hour, slotContents);
                                }
                              }}
                              onDragStart={(e) => canDrag && handleDragStart(e, content)}
                              onDrag={canDrag ? handleDrag : undefined}
                              onDragEnd={canDrag ? handleDragEnd : undefined}
                              style={{ 
                                cursor: isLocked ? 'not-allowed' : isPast ? 'default' : isDragging && draggedItem?.id === content.id ? 'grabbing' : 'grab',
                                WebkitUserSelect: 'none',
                                userSelect: 'none'
                              }}
                              className={cn(
                                "rounded-md p-1.5 text-xs transition-all duration-200 overflow-hidden touch-none",
                                isUploaded 
                                  ? "bg-green-500/20 border border-green-500/40" 
                                  : isLocked 
                                    ? "bg-muted border border-muted-foreground/30 opacity-70" 
                                    : "bg-primary/20 border border-primary/30 hover:bg-primary/30",
                                draggedItem?.id === content.id && "opacity-30 scale-90 ring-2 ring-dashed ring-primary/50 bg-primary/10",
                                lastDroppedId === content.id && "animate-pulse ring-2 ring-green-500 bg-green-100 dark:bg-green-900/30"
                              )}
                            >
                              <div className="flex items-center gap-1">
                                {isUploaded ? (
                                  <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                                ) : isLocked ? (
                                  <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
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
          <DialogContent className="glass border-border w-full max-w-sm sm:max-w-[400px] overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                {selectedSlot?.contents && selectedSlot.contents.length > 0 
                  ? `Manage Content (${selectedSlot.contents.length})` 
                  : 'Add Content'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedSlot && (
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{format(selectedSlot.date, 'EEEE, MMMM d')}</span>
                  <Clock className="w-4 h-4 ml-2" />
                  <span>{selectedSlot.hour.toString().padStart(2, '0')}:00</span>
                </div>
                
                {selectedSlot.contents && selectedSlot.contents.length > 0 ? (
                  <div className="space-y-4">
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-3">
                        {selectedSlot.contents.map(content => {
                          // Get actual scheduled time from content
                          const actualTime = content.scheduled_at 
                            ? format(new Date(content.scheduled_at), 'HH:mm')
                            : `${selectedSlot.hour.toString().padStart(2, '0')}:00`;
                          const isManualMode = !content.scheduled_slot_id;
                          
                          return (
                            <div key={content.id} className="p-4 rounded-lg bg-secondary/30 overflow-hidden">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <FileVideo className="w-6 h-6 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1 overflow-hidden">
                                  <p className="font-medium truncate block w-full" title={content.file_name}>{content.file_name}</p>
                                  <p className="text-sm text-muted-foreground truncate block w-full" title={content.caption || 'No caption'}>
                                    {content.caption || 'No caption'}
                                  </p>
                                  {/* Show actual scheduled time */}
                                  <p className="text-xs text-primary mt-1 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Scheduled: {actualTime}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 mt-3">
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUnschedule(content.id)}
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  Unschedule
                                </Button>
                                <Button 
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleRemoveFromSchedule(content.id)}
                                >
                                  <Trash2 className="w-3 h-3 mr-1" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    
                    <p className="text-xs text-muted-foreground">
                      💡 Tip: Drag content to move to another slot
                    </p>
                    
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
        
        {/* Custom Drag Indicator */}
        {isDragging && draggedItem && dragPosition && (
          <div 
            className="fixed z-[99999] pointer-events-none bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-2xl text-sm font-medium flex items-center gap-2"
            style={{ 
              left: dragPosition.x + 15, 
              top: dragPosition.y + 15,
            }}
          >
            <FileVideo className="w-4 h-4" />
            {draggedItem.file_name.length > 20 
              ? draggedItem.file_name.slice(0, 20) + '...' 
              : draggedItem.file_name}
          </div>
        )}
      </div>
    </div>
  );
}