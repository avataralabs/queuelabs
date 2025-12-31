import { useState } from 'react';
import { useScheduleSlots } from '@/hooks/useScheduleSlots';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScheduleSlotManagerProps {
  profileId: string;
  platform: string;
  onClose: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ScheduleSlotManager({ profileId, platform, onClose }: ScheduleSlotManagerProps) {
  const { slots, addSlot, updateSlot, deleteSlot } = useScheduleSlots(profileId, platform);
  
  const [newSlot, setNewSlot] = useState({
    hour: 12,
    minute: 0,
    type: 'daily' as 'daily' | 'weekly',
    weekDays: [1, 2, 3, 4, 5] as number[], // Mon-Fri by default
  });
  
  const handleAddSlot = () => {
    addSlot.mutate({
      profile_id: profileId,
      platform: platform,
      hour: newSlot.hour,
      minute: newSlot.minute,
      type: newSlot.type,
      week_days: newSlot.type === 'weekly' ? newSlot.weekDays : null,
      is_active: true,
    });
  };
  
  const toggleWeekDay = (day: number) => {
    setNewSlot(prev => ({
      ...prev,
      weekDays: prev.weekDays.includes(day)
        ? prev.weekDays.filter(d => d !== day)
        : [...prev.weekDays, day].sort()
    }));
  };
  
  return (
    <div className="glass rounded-xl border border-border p-6 animate-scale-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Time Slot Settings
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Add New Slot */}
      <div className="p-4 rounded-lg bg-secondary/30 mb-6">
        <p className="text-sm font-medium mb-4">Add New Time Slot</p>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Hour</label>
              <Select 
                value={newSlot.hour.toString()} 
                onValueChange={(v) => setNewSlot(prev => ({ ...prev, hour: parseInt(v) }))}
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
            
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <Select 
                value={newSlot.type} 
                onValueChange={(v: 'daily' | 'weekly') => setNewSlot(prev => ({ ...prev, type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {newSlot.type === 'weekly' && (
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Active Days</label>
              <div className="flex gap-2">
                {DAYS.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => toggleWeekDay(i)}
                    className={cn(
                      "w-10 h-10 rounded-lg text-xs font-medium transition-all duration-200",
                      newSlot.weekDays.includes(i)
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <Button onClick={handleAddSlot} className="w-full" variant="gradient" disabled={addSlot.isPending}>
            <Plus className="w-4 h-4" />
            {addSlot.isPending ? 'Adding...' : 'Add Slot'}
          </Button>
        </div>
      </div>
      
      {/* Existing Slots */}
      <div>
        <p className="text-sm font-medium mb-3">Active Slots ({slots.length})</p>
        
        {slots.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">
            No time slots configured
          </p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
            {slots
              .sort((a, b) => a.hour - b.hour)
              .map(slot => (
                <div 
                  key={slot.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-xl font-mono font-bold">
                      {slot.hour.toString().padStart(2, '0')}:00
                    </div>
                    <div>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs",
                        slot.type === 'daily' 
                          ? "bg-primary/10 text-primary" 
                          : "bg-accent/10 text-accent"
                      )}>
                        {slot.type === 'daily' ? 'Daily' : 'Weekly'}
                      </span>
                      {slot.type === 'weekly' && slot.week_days && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {slot.week_days.map(d => DAYS[d]).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={slot.is_active ?? true}
                      onCheckedChange={(checked) => updateSlot.mutate({ id: slot.id, is_active: checked })}
                    />
                    <Button 
                      variant="ghost" 
                      size="icon-sm"
                      onClick={() => deleteSlot.mutate(slot.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
