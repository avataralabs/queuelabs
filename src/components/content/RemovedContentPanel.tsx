import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/button';
import { FileVideo, RotateCcw, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { toast } from 'sonner';

export function RemovedContentPanel() {
  const { 
    getRemovedContents, 
    restoreRemovedContent, 
    permanentDeleteContent,
    getProfileById 
  } = useAppStore();
  
  const removedContents = getRemovedContents();
  
  const handleRestore = (contentId: string) => {
    restoreRemovedContent(contentId);
    toast.success('Content restored to pending');
  };
  
  const handlePermanentDelete = (contentId: string) => {
    permanentDeleteContent(contentId);
    toast.success('Content permanently deleted');
  };
  
  if (removedContents.length === 0) {
    return null;
  }
  
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 className="w-5 h-5 text-orange-600" />
        <h3 className="font-semibold text-orange-800">Removed from Schedule</h3>
        <span className="text-sm text-orange-600">({removedContents.length})</span>
      </div>
      
      <p className="text-sm text-orange-700 mb-4">
        These contents were removed from schedule without being posted. You can restore them or delete permanently.
      </p>
      
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {removedContents.map(content => {
          const profile = content.removedFromProfileId 
            ? getProfileById(content.removedFromProfileId) 
            : null;
            
          return (
            <div 
              key={content.id} 
              className="flex items-center gap-3 p-3 bg-white rounded-lg border border-orange-100"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <FileVideo className="w-5 h-5 text-orange-600" />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{content.fileName}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {profile && (
                    <>
                      <span>from</span>
                      <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                      <span>{profile.name}</span>
                    </>
                  )}
                  {content.removedAt && (
                    <span>• {format(new Date(content.removedAt), 'MMM d, HH:mm')}</span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon-sm"
                  onClick={() => handleRestore(content.id)}
                  title="Restore to pending"
                >
                  <RotateCcw className="w-4 h-4 text-primary" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon-sm"
                  onClick={() => handlePermanentDelete(content.id)}
                  title="Delete permanently"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}