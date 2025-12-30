import { useState, useEffect } from 'react';
import { useProfiles, Platform } from '@/hooks/useProfiles';
import { useScheduleSlots } from '@/hooks/useScheduleSlots';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { PlatformIcon } from '@/components/common/PlatformIcon';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Users, Clock, Link, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export default function ProfilesPage() {
  const { profiles, isLoading, addProfile, updateProfile, deleteProfile, syncAccounts, regenerateAccessUrl } = useProfiles();
  const { slots } = useScheduleSlots();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', platform: 'tiktok' as Platform });
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  
  // Handle callback from Upload-Post connect page
  useEffect(() => {
    const justConnected = searchParams.get('connected') === 'true';
    if (justConnected) {
      toast({ title: 'Account connected successfully!' });
      // Remove the query param
      setSearchParams({});
      // Sync all profiles to get updated connected accounts
      profiles.forEach(profile => {
        if (profile.uploadpost_username) {
          syncAccounts.mutate(profile.id);
        }
      });
    }
  }, [searchParams]);
  
  const handleSave = () => {
    if (!formData.name.trim()) return;
    
    if (editingProfile) {
      updateProfile.mutate({ id: editingProfile, name: formData.name, platform: formData.platform });
    } else {
      addProfile.mutate({ name: formData.name });
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
      deleteProfile.mutate(id);
    }
  };

  const handleReconnect = (profileId: string) => {
    regenerateAccessUrl.mutate(profileId);
  };
  
  const getSlotCount = (profileId: string) => 
    slots.filter(s => s.profile_id === profileId && s.is_active).length;

  const isConnected = (profile: typeof profiles[0]) => {
    return profile.connected_accounts && profile.connected_accounts.length > 0;
  };

  const isAccessUrlExpired = (profile: typeof profiles[0]) => {
    if (!profile.access_url_expires_at) return true;
    return new Date(profile.access_url_expires_at) < new Date();
  };

  
  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Profiles</h1>
            <p className="text-muted-foreground text-sm">
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
              <Button>
                <Plus className="w-4 h-4" />
                Add Profile
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>
                  {editingProfile ? 'Edit Profile' : 'New Profile'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Profile Name</label>
                  <Input
                    placeholder="My Account"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <Button 
                  onClick={handleSave} 
                  className="w-full"
                  disabled={addProfile.isPending}
                >
                  {addProfile.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : editingProfile ? 'Save Changes' : 'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Profiles Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : profiles.length === 0 ? (
          <div className="glass rounded-xl p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No Profiles Yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first profile to start scheduling content
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Profile
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map(profile => (
              <div 
                key={profile.id}
                className="glass rounded-xl p-5 hover:shadow-elevated transition-all duration-200 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={profile.platform} />
                    {isConnected(profile) ? (
                      <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/10">
                        <XCircle className="w-3 h-3 mr-1" />
                        Not Connected
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                
                <h3 className="text-lg font-semibold mb-1">{profile.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Created {format(new Date(profile.created_at), 'MMM d, yyyy')}
                </p>

                {/* Connected Account Info */}
                {isConnected(profile) && profile.connected_accounts?.[0] && (
                  <div className="mb-4 p-3 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium">
                      @{profile.connected_accounts[0].username}
                    </p>
                  </div>
                )}

                {/* Reconnect Button */}
                {!isConnected(profile) && profile.uploadpost_username && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mb-4"
                    onClick={() => handleReconnect(profile.id)}
                    disabled={regenerateAccessUrl.isPending}
                  >
                    {regenerateAccessUrl.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link className="w-4 h-4" />
                    )}
                    Connect Account
                  </Button>
                )}
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4 border-t border-border">
                  <Clock className="w-4 h-4" />
                  <span>{getSlotCount(profile.id)} time slots</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
