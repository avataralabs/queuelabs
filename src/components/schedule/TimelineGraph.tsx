import { useState, DragEvent } from 'react';
import { useAppStore } from '@/stores/appStore';
import { Content, ScheduledContent, ScheduleSlot } from '@/types';
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
  dates: Date[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimelineGraph({ profileId, dates }: TimelineGraphProps) {
  const { 
    scheduleSlots, 
    scheduledContents, 
    contents, 
    getPendingContents,
    scheduleContent,
    moveScheduledContent,
    swapScheduledContents,
    removeFromSchedule,
    unscheduleContent 
  } = useAppStore();
  
  const [selectedSlot, setSelectedSlot] = useState<{
    date: Date;
    hour: number;
    scheduledContent?: ScheduledContent;
  } | null>(null);
  
  const [draggedItem, setDraggedItem] = useState<ScheduledContent | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: Date; hour: number } | null>(null);
  
  const profileSlots = scheduleSlots.filter(s => s.profileId === profileId && s.isActive);
  const pendingContents = getPendingContents();
  
  const getScheduledContentForSlot = (date: Date, hour: number): ScheduledContent | undefined => {
    const dateStr = startOfDay(date).toISOString();
    return scheduledContents.find(sc => 
      sc.profileId === profileId &&
      startOfDay(new Date(sc.scheduledDate)).toISOString() === dateStr &&
      sc.hour === hour
    );
  };
  
  const getSlotForHour = (hour: number): ScheduleSlot | undefined => {
    return profileSlots.find(s => s.hour === hour);
  };
  
  const hasSlotAtHour = (hour: number, date: Date): boolean => {
    const slot = profileSlots.find(s => s.hour === hour);
    if (!slot) return false;
    if (slot.type === 'daily') return true;
    if (slot.type === 'weekly' && slot.weekDays) {
      return slot.weekDays.includes(date.getDay());
    }
    return false;
  };
  
  const getContentById = (id: string): Content | undefined => {
    return contents.find(c => c.id === id);
  };
  
  const handleSlotClick = (date: Date, hour: number) => {
    const scheduled = getScheduledContentForSlot(date, hour);
    const hasSlot = hasSlotAtHour(hour, date);
    
    // Don't allow interaction with past slots
    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);
    if (isBefore(slotTime, new Date())) return;
    
    if (scheduled) {
      setSelectedSlot({ date, hour, scheduledContent: scheduled });
    } else if (hasSlot && pendingContents.length > 0) {
      setSelectedSlot({ date, hour });
    }
  };
  
  const handleAssignContent = (contentId: string) => {
    if (!selectedSlot) return;
    
    const slot = getSlotForHour(selectedSlot.hour);
    if (!slot) return;
    
    scheduleContent(
      contentId, 
      profileId, 
      slot.id, 
      selectedSlot.date, 
      selectedSlot.hour, 
      slot.minute || 0
    );
    
    setSelectedSlot(null);
    toast.success('Content scheduled');
  };
  
  const handleRemoveFromSchedule = (scId: string) => {
    removeFromSchedule(scId);
    setSelectedSlot(null);
    toast.success('Content removed from schedule (moved to trash)');
  };
  
  const handleUnschedule = (scId: string) => {
    unscheduleContent(scId);
    setSelectedSlot(null);
    toast.success('Content unscheduled (back to pending)');
  };
  
  // Drag and Drop handlers
  const handleDragStart = (e: DragEvent, scheduled: ScheduledContent) => {
    setDraggedItem(scheduled);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', scheduled.id);
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
    if (!hasSlot && !getScheduledContentForSlot(date, hour)) return;
    
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
    
    const targetScheduled = getScheduledContentForSlot(date, hour);
    
    if (targetScheduled) {
      // Swap with existing content
      if (targetScheduled.id !== draggedItem.id) {
        swapScheduledContents(draggedItem.id, targetScheduled.id);
        toast.success('Content swapped');
      }
    } else {
      // Move to empty slot
      const slot = getSlotForHour(hour);
      if (slot) {
        moveScheduledContent(draggedItem.id, date, hour, slot.minute || 0);
        toast.success('Content moved');
      }
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
                const scheduled = getScheduledContentForSlot(date, hour);
                const hasSlot = hasSlotAtHour(hour, date);
                const content = scheduled ? getContentById(scheduled.contentId) : undefined;
                const slotTime = new Date(date);
                slotTime.setHours(hour, 0, 0, 0);
                const isPast = isBefore(slotTime, new Date());
                const isDragOver = dragOverSlot?.date.toISOString() === date.toISOString() && dragOverSlot?.hour === hour;
                const isDragging = draggedItem?.id === scheduled?.id;
                
                return (
                  <div
                    key={`${date.toISOString()}-${hour}`}
                    onClick={() => !draggedItem && handleSlotClick(date, hour)}
                    onDragOver={(e) => handleDragOver(e, date, hour)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, date, hour)}
                    className={cn(
                      "min-h-[50px] border-l border-border/50 p-1 transition-all duration-200",
                      hasSlot && !scheduled && !isPast && "bg-timeline-slot cursor-pointer hover:bg-timeline-slot-hover",
                      scheduled && "bg-timeline-slot-filled",
                      isPast && "opacity-50",
                      isToday(date) && "bg-primary/5",
                      isDragOver && !isDragging && "ring-2 ring-primary bg-primary/20",
                      isDragOver && scheduled && !isDragging && "ring-2 ring-amber-400 bg-amber-100"
                    )}
                  >
                    {scheduled && content && (
                      <div 
                        draggable={!isPast}
                        onDragStart={(e) => handleDragStart(e, scheduled)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "h-full rounded-md p-2 text-xs transition-all duration-200 cursor-grab active:cursor-grabbing",
                          "bg-primary/20 border border-primary/30 hover:bg-primary/30",
                          isDragging && "opacity-50 ring-2 ring-primary"
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <p className="font-medium truncate flex-1" title={content.fileName}>
                            {content.fileName.length > 12 
                              ? `${content.fileName.slice(0, 12)}...` 
                              : content.fileName
                            }
                          </p>
                        </div>
                        <p className="text-muted-foreground mt-0.5 ml-4">
                          {format(new Date(scheduled.scheduledDate), 'HH:mm')}
                        </p>
                      </div>
                    )}
                    {hasSlot && !scheduled && !isPast && (
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
                {selectedSlot?.scheduledContent ? 'Manage Scheduled Content' : 'Add Content'}
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
                
                {selectedSlot.scheduledContent ? (
                  <div className="space-y-4">
                    {(() => {
                      const content = getContentById(selectedSlot.scheduledContent!.contentId);
                      return content ? (
                        <div className="p-4 rounded-lg bg-secondary/30">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                              <FileVideo className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{content.fileName}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-[250px]">
                                {content.caption || 'No caption'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    
                    <p className="text-xs text-muted-foreground">
                      💡 Tip: Drag content to move or swap with another
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => handleUnschedule(selectedSlot.scheduledContent!.id)}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Unschedule
                      </Button>
                      <Button 
                        variant="destructive"
                        onClick={() => handleRemoveFromSchedule(selectedSlot.scheduledContent!.id)}
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
                            <p className="font-medium truncate">{content.fileName}</p>
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