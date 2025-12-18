import { useState, useRef } from 'react';
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
  DialogTitle 
} from '@/components/ui/dialog';
import { Upload, FileVideo, Trash2, Send, Calendar, CloudUpload } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ContentPage() {
  const { contents, profiles, addContent, deleteContent, assignContentToProfile } = useAppStore();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [newContent, setNewContent] = useState({ fileName: '', caption: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const pendingContents = contents.filter(c => c.status === 'pending');
  const assignedContents = contents.filter(c => c.status === 'assigned' || c.status === 'scheduled');
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setNewContent(prev => ({ ...prev, fileName: file.name }));
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = () => {
    if (!newContent.fileName.trim()) return;
    
    addContent({
      fileName: newContent.fileName,
      caption: newContent.caption,
      fileSize: selectedFile?.size || Math.random() * 100 * 1024 * 1024,
    });
    
    setNewContent({ fileName: '', caption: '' });
    setSelectedFile(null);
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
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-1">Content</h1>
          <p className="text-muted-foreground text-sm">
            Upload and manage your video content
          </p>
        </div>
        
        {/* Upload Section - Main/Large */}
        <div className="glass rounded-xl p-8">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="video/*"
            className="hidden"
          />
          
          <div 
            onClick={handleUploadClick}
            className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer mb-6"
          >
            <CloudUpload className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">
              {selectedFile ? selectedFile.name : 'Click to upload video'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {selectedFile 
                ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
                : 'or drag & drop your video file here'
              }
            </p>
          </div>
          
          {selectedFile && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Caption</label>
                <Textarea
                  placeholder="Write your caption here..."
                  rows={3}
                  value={newContent.caption}
                  onChange={(e) => setNewContent(prev => ({ ...prev, caption: e.target.value }))}
                  className="resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleUpload} className="flex-1" variant="default">
                  <Upload className="w-4 h-4" />
                  Add to Queue
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSelectedFile(null);
                    setNewContent({ fileName: '', caption: '' });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        
        {/* Info Cards - Smaller */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pending Content */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-warning" />
                Pending ({pendingContents.length})
              </h2>
            </div>
            
            {pendingContents.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <FileVideo className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No pending content</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-thin">
                {pendingContents.map(content => (
                  <div 
                    key={content.id}
                    className="p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileVideo className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate" title={content.fileName}>
                            {content.fileName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(content.uploadedAt), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          size="icon-sm" 
                          variant="ghost"
                          onClick={() => {
                            setSelectedContentId(content.id);
                            setAssignDialogOpen(true);
                          }}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          size="icon-sm" 
                          variant="ghost"
                          onClick={() => deleteContent(content.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Assigned/Scheduled Content */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary" />
                Assigned ({assignedContents.length})
              </h2>
            </div>
            
            {assignedContents.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No assigned content</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-thin">
                {assignedContents.map(content => {
                  const profile = getProfileById(content.assignedProfileId);
                  return (
                    <div 
                      key={content.id}
                      className="p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileVideo className="w-4 h-4 text-primary flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate" title={content.fileName}>
                              {content.fileName}
                            </p>
                            {profile && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                                <span className="text-xs text-muted-foreground">{profile.name}</span>
                                {content.scheduledAt && (
                                  <span className="text-xs text-primary ml-1">
                                    • {format(new Date(content.scheduledAt), 'HH:mm')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs",
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
          <DialogContent className="bg-card border-border">
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
                      className="w-full p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors flex items-center justify-between"
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