import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { Content, ScheduledContent, ScheduleSlot } from '@/types';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, isToday, isBefore, startOfDay, addDays, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { FileVideo, ArrowRight, Calendar, Clock, ChevronLeft, ChevronRight, Trash2, ArrowLeftRight, RotateCcw } from 'lucide-react';
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
  
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingContent, setMovingContent] = useState<ScheduledContent | null>(null);
  const [moveTargetDate, setMoveTargetDate] = useState<Date>(new Date());
  const [moveTargetHour, setMoveTargetHour] = useState<number>(12);
  
  const [swapMode, setSwapMode] = useState(false);
  const [swapSource, setSwapSource] = useState<ScheduledContent | null>(null);
  
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
    
    // Handle swap mode
    if (swapMode && swapSource && scheduled) {
      if (scheduled.id !== swapSource.id) {
        swapScheduledContents(swapSource.id, scheduled.id);
        toast.success('Content swapped successfully');
      }
      setSwapMode(false);
      setSwapSource(null);
      return;
    }
    
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
  
  const handleMoveContent = (sc: ScheduledContent) => {
    setMovingContent(sc);
    setMoveTargetDate(new Date(sc.scheduledDate));
    setMoveTargetHour(sc.hour);
    setMoveDialogOpen(true);
    setSelectedSlot(null);
  };
  
  const confirmMove = () => {
    if (!movingContent) return;
    
    moveScheduledContent(movingContent.id, moveTargetDate, moveTargetHour, 0);
    setMoveDialogOpen(false);
    setMovingContent(null);
    toast.success('Content moved');
  };
  
  const handleStartSwap = (sc: ScheduledContent) => {
    setSwapSource(sc);
    setSwapMode(true);
    setSelectedSlot(null);
    toast.info('Click on another scheduled content to swap');
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
  
  const cancelSwapMode = () => {
    setSwapMode(false);
    setSwapSource(null);
  };
  
  return (
    <div className="space-y-3">
      {/* Swap Mode Indicator */}
      {swapMode && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 text-amber-800">
            <ArrowLeftRight className="w-4 h-4" />
            <span className="text-sm font-medium">Swap mode: Click another scheduled content to swap</span>
          </div>
          <Button variant="ghost" size="sm" onClick={cancelSwapMode}>
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
                const isSwapTarget = swapMode && scheduled && swapSource?.id !== scheduled.id;
                
                return (
                  <div
                    key={`${date.toISOString()}-${hour}`}
                    onClick={() => handleSlotClick(date, hour)}
                    className={cn(
                      "min-h-[50px] border-l border-border/50 p-1 transition-all duration-200",
                      hasSlot && !scheduled && !isPast && "bg-timeline-slot cursor-pointer hover:bg-timeline-slot-hover",
                      scheduled && "bg-timeline-slot-filled",
                      isPast && "opacity-50",
                      isToday(date) && "bg-primary/5",
                      isSwapTarget && "ring-2 ring-amber-400 cursor-pointer"
                    )}
                  >
                    {scheduled && content && (
                      <div 
                        className={cn(
                          "h-full rounded-md p-2 text-xs transition-all duration-200",
                          "bg-primary/20 border border-primary/30 hover:bg-primary/30 cursor-pointer",
                          swapMode && swapSource?.id === scheduled.id && "ring-2 ring-amber-500 bg-amber-100"
                        )}
                      >
                        <p className="font-medium truncate" title={content.fileName}>
                          {content.fileName.length > 15 
                            ? `${content.fileName.slice(0, 15)}...` 
                            : content.fileName
                          }
                        </p>
                        <p className="text-muted-foreground mt-0.5">
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
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant="outline" 
                        onClick={() => handleMoveContent(selectedSlot.scheduledContent!)}
                      >
                        <ArrowRight className="w-4 h-4 mr-1" />
                        Move
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => handleStartSwap(selectedSlot.scheduledContent!)}
                      >
                        <ArrowLeftRight className="w-4 h-4 mr-1" />
                        Swap
                      </Button>
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
        
        {/* Move Dialog */}
        <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
          <DialogContent className="glass border-border">
            <DialogHeader>
              <DialogTitle>Move Content</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 pt-4">
              {movingContent && (
                <>
                  {(() => {
                    const content = getContentById(movingContent.contentId);
                    return content ? (
                      <div className="p-3 rounded-lg bg-secondary/30 flex items-center gap-3">
                        <FileVideo className="w-5 h-5 text-primary" />
                        <span className="font-medium truncate">{content.fileName}</span>
                      </div>
                    ) : null;
                  })()}
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-2 block">New Date</label>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="icon-sm"
                          onClick={() => setMoveTargetDate(prev => subDays(prev, 1))}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div className="flex-1 text-center py-2 px-4 rounded-lg bg-secondary/30">
                          {format(moveTargetDate, 'EEEE, MMMM d')}
                        </div>
                        <Button 
                          variant="outline" 
                          size="icon-sm"
                          onClick={() => setMoveTargetDate(prev => addDays(prev, 1))}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium mb-2 block">New Time</label>
                      <Select 
                        value={moveTargetHour.toString()} 
                        onValueChange={(v) => setMoveTargetHour(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {HOURS.map(h => (
                            <SelectItem key={h} value={h.toString()}>
                              {h.toString().padStart(2, '0')}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <Button onClick={confirmMove} className="w-full" variant="gradient">
                    Confirm Move
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}