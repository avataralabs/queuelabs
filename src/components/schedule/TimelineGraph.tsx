import { useState, DragEvent } from 'react';
import { useScheduleSlots } from '@/hooks/useScheduleSlots';
import { useContents } from '@/hooks/useContents';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from '@/components/ui/dialog';
import { format, isToday, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { FileVideo, Calendar, Clock, Trash2, RotateCcw, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

interface TimelineGraphProps {
  profileId: string;
  platform: string;
  dates: Date[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimelineGraph({ profileId, platform, dates }: TimelineGraphProps) {
  // Use Supabase hooks instead of local store
  const { slots: allSlots } = useScheduleSlots();
  const { contents, updateContent } = useContents();
  
  const [selectedSlot, setSelectedSlot] = useState<{
    date: Date;
    hour: number;
    content?: typeof contents[0];
  } | null>(null);
  
  const [draggedItem, setDraggedItem] = useState<typeof contents[0] | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: Date; hour: number } | null>(null);
  
  // Filter slots by profileId AND platform
  const profileSlots = allSlots.filter(s => 
    s.profile_id === profileId && 
    s.platform === platform && 
    s.is_active
  );
  
  // Get assigned/scheduled contents for this profile
  const assignedContents = contents.filter(c => 
    c.assigned_profile_id === profileId &&
    c.scheduled_slot_id &&
    (c.status === 'assigned' || c.status === 'scheduled')
  );
  
  // Get pending contents for scheduling
  const pendingContents = contents.filter(c => c.status === 'pending');
  
  // Get content assigned to a specific slot
  const getContentForSlot = (slotId: string): typeof contents[0] | undefined => {
    return assignedContents.find(c => c.scheduled_slot_id === slotId);
  };
  
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
  
  const getContentForHour = (date: Date, hour: number): typeof contents[0] | undefined => {
    const slot = getSlotForHour(hour);
    if (!slot) return undefined;
    return getContentForSlot(slot.id);
  };
  
  const handleSlotClick = (date: Date, hour: number) => {
    const content = getContentForHour(date, hour);
    const hasSlot = hasSlotAtHour(hour, date);
    
    // Don't allow interaction with past slots
    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);
    if (isBefore(slotTime, new Date())) return;
    
    if (content) {
      setSelectedSlot({ date, hour, content });
    } else if (hasSlot && pendingContents.length > 0) {
      setSelectedSlot({ date, hour });
    }
  };
  
  const handleAssignContent = (contentId: string) => {
    if (!selectedSlot) return;
    
    const slot = getSlotForHour(selectedSlot.hour);
    if (!slot) return;
    
    updateContent.mutate({
      id: contentId,
      assigned_profile_id: profileId,
      scheduled_slot_id: slot.id,
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
      assigned_profile_id: null,
    });
    setSelectedSlot(null);
    toast.success('Content unscheduled (back to pending)');
  };
  
  // Drag and Drop handlers
  const handleDragStart = (e: DragEvent, content: typeof contents[0]) => {
    setDraggedItem(content);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', content.id);
  };
  
  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverSlot(null);
  };
  
  const handleDragOver = (e: DragEvent, date: Date, hour: number) => {
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
  
  const handleDrop = (e: DragEvent, date: Date, hour: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    
    if (!draggedItem) return;
    
    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);
    if (isBefore(slotTime, new Date())) return;
    
    const targetContent = getContentForHour(date, hour);
    const targetSlot = getSlotForHour(hour);
    
    if (!targetSlot) return;
    
    if (targetContent) {
      // Swap with existing content
      if (targetContent.id !== draggedItem.id) {
        const draggedSlotId = draggedItem.scheduled_slot_id;
        // Update target content to dragged item's slot
        updateContent.mutate({
          id: targetContent.id,
          scheduled_slot_id: draggedSlotId,
        });
        // Update dragged item to target slot
        updateContent.mutate({
          id: draggedItem.id,
          scheduled_slot_id: targetSlot.id,
        });
        toast.success('Content swapped');
      }
    } else {
      // Move to empty slot
      updateContent.mutate({
        id: draggedItem.id,
        scheduled_slot_id: targetSlot.id,
      });
      toast.success('Content moved');
    }
    
    setDraggedItem(null);
  };
  
  return (
    <div className="space-y-3">
      {/* Drag Indicator */}
      {draggedItem && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
          <div className="flex items-center gap-2 text-primary">
            <GripVertical className="w-4 h-4" />
            <span className="text-sm font-medium">
              Dragging: Drop on empty slot to move, or on another content to swap
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleDragEnd}>
            Cancel
          </Button>
        </div>
      )}
      
      <div className="glass rounded-xl border border-border overflow-hidden">
        {/* Date Headers */}
        <div className="grid grid-cols-[60px_repeat(4,1fr)] border-b border-border">
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
        <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
          {HOURS.map(hour => (
            <div key={hour} className="grid grid-cols-[60px_repeat(4,1fr)] border-b border-border/50 last:border-b-0">
              {/* Hour Label */}
              <div className="p-2 text-center text-sm text-muted-foreground bg-secondary/20 flex items-center justify-center">
                {hour.toString().padStart(2, '0')}:00
              </div>
              
              {/* Day Slots */}
              {dates.map(date => {
                const content = getContentForHour(date, hour);
                const hasSlot = hasSlotAtHour(hour, date);
                const slotTime = new Date(date);
                slotTime.setHours(hour, 0, 0, 0);
                const isPast = isBefore(slotTime, new Date());
                const isDragOver = dragOverSlot?.date.toISOString() === date.toISOString() && dragOverSlot?.hour === hour;
                const isDragging = draggedItem?.id === content?.id;
                
                return (
                  <div
                    key={`${date.toISOString()}-${hour}`}
                    onClick={() => !draggedItem && handleSlotClick(date, hour)}
                    onDragOver={(e) => handleDragOver(e, date, hour)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, date, hour)}
                    className={cn(
                      "min-h-[50px] border-l border-border/50 p-1 transition-all duration-200",
                      hasSlot && !content && !isPast && "bg-timeline-slot cursor-pointer hover:bg-timeline-slot-hover",
                      content && "bg-timeline-slot-filled",
                      isPast && "opacity-50",
                      isToday(date) && "bg-primary/5",
                      isDragOver && !isDragging && "ring-2 ring-primary bg-primary/20",
                      isDragOver && content && !isDragging && "ring-2 ring-amber-400 bg-amber-100"
                    )}
                  >
                    {content && (
                      <div 
                        draggable={!isPast}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          handleDragStart(e, content);
                        }}
                        onDragEnd={(e) => {
                          e.stopPropagation();
                          handleDragEnd();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={cn(
                          "h-full rounded-md p-2 text-xs transition-all duration-200 select-none",
                          !isPast && "cursor-grab active:cursor-grabbing",
                          "bg-primary/20 border border-primary/30 hover:bg-primary/30",
                          isDragging && "opacity-50 ring-2 ring-primary"
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <p className="font-medium truncate flex-1" title={content.file_name}>
                            {content.file_name.length > 12 
                              ? `${content.file_name.slice(0, 12)}...` 
                              : content.file_name
                            }
                          </p>
                        </div>
                        <p className="text-muted-foreground mt-0.5 ml-4">
                          {hour.toString().padStart(2, '0')}:00
                        </p>
                      </div>
                    )}
                    {hasSlot && !content && !isPast && (
                      <div className="h-full flex items-center justify-center text-muted-foreground opacity-0 hover:opacity-100 transition-opacity">
                        <span className="text-xs">+ Add</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        
        {/* Slot Action Dialog */}
        <Dialog open={!!selectedSlot} onOpenChange={() => setSelectedSlot(null)}>
          <DialogContent className="glass border-border">
            <DialogHeader>
              <DialogTitle>
                {selectedSlot?.content ? 'Manage Scheduled Content' : 'Add Content'}
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
                
                {selectedSlot.content ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-secondary/30">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileVideo className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{selectedSlot.content.file_name}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[250px]">
                            {selectedSlot.content.caption || 'No caption'}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      💡 Tip: Drag content to move or swap with another
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => handleUnschedule(selectedSlot.content!.id)}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Unschedule
                      </Button>
                      <Button 
                        variant="destructive"
                        onClick={() => handleRemoveFromSchedule(selectedSlot.content!.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      <strong>Unschedule:</strong> Back to pending • <strong>Remove:</strong> Move to trash
                    </p>
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
