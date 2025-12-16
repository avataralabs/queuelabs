import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlatformBadge } from '@/components/common/PlatformBadge';
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
import { Upload, FileVideo, Trash2, Send, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ContentPage() {
  const { contents, profiles, addContent, deleteContent, assignContentToProfile } = useAppStore();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [newContent, setNewContent] = useState({ fileName: '', caption: '' });
  
  const pendingContents = contents.filter(c => c.status === 'pending');
  const assignedContents = contents.filter(c => c.status === 'assigned' || c.status === 'scheduled');
  
  const handleUpload = () => {
    if (!newContent.fileName.trim()) return;
    
    addContent({
      fileName: newContent.fileName,
      caption: newContent.caption,
      fileSize: Math.random() * 100 * 1024 * 1024, // Mock file size
    });
    
    setNewContent({ fileName: '', caption: '' });
    setUploadDialogOpen(false);
  };
  
  const handleAssign = (profileId: string) => {
    if (selectedContentId) {
      assignContentToProfile(selectedContentId, profileId);
      setAssignDialogOpen(false);
      setSelectedContentId(null);
    }
  };
  
  const getProfileById = (id?: string) => profiles.find(p => p.id === id);
  
  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Content</h1>
            <p className="text-muted-foreground">
              Manage and upload your video content
            </p>
          </div>
          
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="glow" size="lg">
                <Upload className="w-5 h-5" />
                Upload Content
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-border">
              <DialogHeader>
                <DialogTitle className="gradient-text">Upload New Content</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                  <FileVideo className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-2">Drag & drop your video here</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">File Name</label>
                  <Input
                    placeholder="video_filename.mp4"
                    value={newContent.fileName}
                    onChange={(e) => setNewContent(prev => ({ ...prev, fileName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Caption</label>
                  <Textarea
                    placeholder="Write your caption here..."
                    rows={4}
                    value={newContent.caption}
                    onChange={(e) => setNewContent(prev => ({ ...prev, caption: e.target.value }))}
                  />
                </div>
                <Button onClick={handleUpload} className="w-full" variant="gradient">
                  <Upload className="w-4 h-4" />
                  Upload Video
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Content Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pending Content */}
          <div className="glass rounded-xl border border-border p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-warning" />
              Pending Content ({pendingContents.length})
            </h2>
            
            {pendingContents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileVideo className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No pending content</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin">
                {pendingContents.map(content => (
                  <div 
                    key={content.id}
                    className="p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileVideo className="w-6 h-6 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate" title={content.fileName}>
                            {content.fileName}
                          </p>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {content.caption || 'No caption'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(content.uploadedAt), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          size="icon-sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedContentId(content.id);
                            setAssignDialogOpen(true);
                          }}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="icon-sm" 
                          variant="outline"
                          onClick={() => deleteContent(content.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Assigned/Scheduled Content */}
          <div className="glass rounded-xl border border-border p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              Assigned Content ({assignedContents.length})
            </h2>
            
            {assignedContents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No assigned content</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin">
                {assignedContents.map(content => {
                  const profile = getProfileById(content.assignedProfileId);
                  return (
                    <div 
                      key={content.id}
                      className="p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <FileVideo className="w-6 h-6 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate" title={content.fileName}>
                              {content.fileName}
                            </p>
                            {profile && (
                              <div className="flex items-center gap-2 mt-1">
                                <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                                <span className="text-sm text-muted-foreground">{profile.name}</span>
                              </div>
                            )}
                            {content.scheduledAt && (
                              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(content.scheduledAt), 'MMM d, HH:mm')}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs",
                          content.status === 'scheduled' 
                            ? "bg-primary/10 text-primary" 
                            : "bg-warning/10 text-warning"
                        )}>
                          {content.status === 'scheduled' ? 'Scheduled' : 'Assigned'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        
        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="glass border-border">
            <DialogHeader>
              <DialogTitle>Assign to Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {profiles.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No profiles created yet. Create a profile first.
                </p>
              ) : (
                <div className="space-y-2">
                  {profiles.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => handleAssign(profile.id)}
                      className="w-full p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium">{profile.name}</span>
                      <PlatformBadge platform={profile.platform} size="sm" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
