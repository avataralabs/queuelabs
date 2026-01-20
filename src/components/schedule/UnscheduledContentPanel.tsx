import { useState } from 'react';
import { useContents, Content } from '@/hooks/useContents';
import { useScheduleSlots, ScheduleSlot } from '@/hooks/useScheduleSlots';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { AlertCircle, FileVideo, Calendar as CalendarIcon, Clock, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface UnscheduledContentPanelProps {
  profileId: string;
  platform: string;
}

export function UnscheduledContentPanel({ profileId, platform }: UnscheduledContentPanelProps) {
  const { contents, updateContent } = useContents();
  const { slots } = useScheduleSlots(profileId, platform);
  
  const [scheduleDialogContent, setScheduleDialogContent] = useState<Content | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  
  // Filter unscheduled assigned contents:
  // - assigned to this profile
  // - no scheduled_slot_id
  // - no scheduled_at
  // - status is 'assigned'
  const unscheduledContents = contents.filter(c => 
    c.assigned_profile_id === profileId &&
    !c.scheduled_slot_id &&
    !c.scheduled_at &&
    c.status === 'assigned'
  );
  
  // Get active slots for the dropdown
  const activeSlots = slots.filter(s => s.is_active);
  
  if (unscheduledContents.length === 0) {
    return null;
  }
  
  const handleSchedule = () => {
    if (!scheduleDialogContent || !selectedSlotId || !selectedDate) return;
    
    const slot = activeSlots.find(s => s.id === selectedSlotId);
    if (!slot) return;
    
    // Create scheduled_at datetime
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(slot.hour, slot.minute, 0, 0);
    
    // Validate not in past
    if (isBefore(scheduledAt, new Date())) {
      toast.error('Cannot schedule in the past');
      return;
    }
    
    updateContent.mutate({
      id: scheduleDialogContent.id,
      scheduled_slot_id: slot.id,
      scheduled_at: scheduledAt.toISOString(),
      platform: platform,
    });
    
    setScheduleDialogContent(null);
    setSelectedSlotId('');
    setSelectedDate(addDays(new Date(), 1));
    toast.success('Content scheduled');
  };
  
  const handleBackToPending = (contentId: string) => {
    updateContent.mutate({
      id: contentId,
      status: 'pending',
      assigned_profile_id: null,
    });
    toast.success('Content moved back to pending');
  };
  
  const handleRemove = (contentId: string) => {
    updateContent.mutate({
      id: contentId,
      status: 'removed',
      removed_at: new Date().toISOString(),
      removed_from_profile_id: profileId,
      assigned_profile_id: null,
    });
    toast.success('Content removed');
  };
  
  return (
    <>
      <div className="glass rounded-xl border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-5 h-5 text-warning" />
          <h3 className="font-semibold text-warning">
            {unscheduledContents.length} Assigned Content{unscheduledContents.length > 1 ? 's' : ''} Need Scheduling
          </h3>
        </div>
        
        <div className="space-y-2">
          {unscheduledContents.map(content => (
            <div 
              key={content.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileVideo className="w-5 h-5 text-primary" />
              </div>
              
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate text-sm" title={content.file_name}>
                  {content.file_name}
                </p>
                <p className="text-xs text-muted-foreground truncate" title={content.caption || 'No caption'}>
                  {content.caption || 'No caption'}
                </p>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                <Button 
                  size="sm" 
                  variant="default"
                  onClick={() => setScheduleDialogContent(content)}
                  disabled={activeSlots.length === 0}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  Schedule
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBackToPending(content.id)}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Pending
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => handleRemove(content.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        {activeSlots.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            No time slots configured. Add time slots first to schedule content.
          </p>
        )}
      </div>
      
      {/* Schedule Dialog */}
      <Dialog open={!!scheduleDialogContent} onOpenChange={() => setScheduleDialogContent(null)}>
        <DialogContent className="glass border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Content</DialogTitle>
          </DialogHeader>
          
          {scheduleDialogContent && (
            <div className="space-y-4 pt-2">
              {/* Content Preview */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <FileVideo className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-sm">{scheduleDialogContent.file_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {scheduleDialogContent.caption || 'No caption'}
                  </p>
                </div>
              </div>
              
              {/* Slot Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Time Slot</label>
                <Select value={selectedSlotId} onValueChange={setSelectedSlotId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSlots.map(slot => (
                      <SelectItem key={slot.id} value={slot.id}>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>
                            {slot.hour.toString().padStart(2, '0')}:{slot.minute.toString().padStart(2, '0')}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            ({slot.type === 'daily' ? 'Daily' : 'Weekly'})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Date Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => isBefore(date, startOfDay(new Date()))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setScheduleDialogContent(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSchedule}
                  disabled={!selectedSlotId || !selectedDate}
                >
                  Schedule
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
