import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { Platform } from '@/types';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Users, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ProfilesPage() {
  const { profiles, scheduleSlots, addProfile, updateProfile, deleteProfile } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', platform: 'tiktok' as Platform });
  
  const handleSave = () => {
    if (!formData.name.trim()) return;
    
    if (editingProfile) {
      updateProfile(editingProfile, formData);
    } else {
      addProfile(formData);
    }
    
    setFormData({ name: '', platform: 'tiktok' });
    setEditingProfile(null);
    setDialogOpen(false);
  };
  
  const handleEdit = (profile: typeof profiles[0]) => {
    setFormData({ name: profile.name, platform: profile.platform });
    setEditingProfile(profile.id);
    setDialogOpen(true);
  };
  
  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this profile? All scheduled content will be removed.')) {
      deleteProfile(id);
    }
  };
  
  const getSlotCount = (profileId: string) => 
    scheduleSlots.filter(s => s.profileId === profileId && s.isActive).length;
  
  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Profiles</h1>
            <p className="text-muted-foreground">
              Manage your social media profiles
            </p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingProfile(null);
              setFormData({ name: '', platform: 'tiktok' });
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="glow" size="lg">
                <Plus className="w-5 h-5" />
                Add Profile
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-border">
              <DialogHeader>
                <DialogTitle className="gradient-text">
                  {editingProfile ? 'Edit Profile' : 'New Profile'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Profile Name</label>
                  <Input
                    placeholder="My TikTok Account"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Platform</label>
                  <Select 
                    value={formData.platform} 
                    onValueChange={(value: Platform) => setFormData(prev => ({ ...prev, platform: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiktok">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded bg-gradient-tiktok" />
                          TikTok
                        </div>
                      </SelectItem>
                      <SelectItem value="instagram">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded bg-gradient-instagram" />
                          Instagram
                        </div>
                      </SelectItem>
                      <SelectItem value="youtube">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded bg-youtube" />
                          YouTube
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSave} className="w-full" variant="gradient">
                  {editingProfile ? 'Save Changes' : 'Create Profile'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Profiles Grid */}
        {profiles.length === 0 ? (
          <div className="glass rounded-xl border border-border p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No Profiles Yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first profile to start scheduling content
            </p>
            <Button variant="glow" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Profile
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {profiles.map(profile => (
              <div 
                key={profile.id}
                className="glass rounded-xl border border-border p-6 hover:border-primary/30 transition-all duration-300 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <PlatformBadge platform={profile.platform} />
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      size="icon-sm" 
                      variant="ghost"
                      onClick={() => handleEdit(profile)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon-sm" 
                      variant="ghost"
                      onClick={() => handleDelete(profile.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                
                <h3 className="text-xl font-semibold mb-2">{profile.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Created {format(new Date(profile.createdAt), 'MMM d, yyyy')}
                </p>
                
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>{getSlotCount(profile.id)} time slots</span>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/schedule?profile=${profile.id}`}>
                      Manage Schedule
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
