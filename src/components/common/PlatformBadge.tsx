import { Platform } from '@/types';
import { cn } from '@/lib/utils';
import { PlatformIcon } from './PlatformIcon';

interface PlatformBadgeProps {
  platform: Platform;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const platformConfig = {
  tiktok: {
    label: 'TikTok',
    gradient: 'bg-gradient-tiktok',
    textColor: 'text-foreground',
  },
  instagram: {
    label: 'Instagram',
    gradient: 'bg-gradient-instagram',
    textColor: 'text-foreground',
  },
  youtube: {
    label: 'YouTube',
    gradient: 'bg-youtube',
    textColor: 'text-foreground',
  },
};

const sizeClasses = {
  sm: 'h-6 text-xs px-2',
  md: 'h-8 text-sm px-3',
  lg: 'h-10 text-base px-4',
};

const iconSizes: Record<string, 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
};

export function PlatformBadge({ platform, size = 'md', showLabel = true }: PlatformBadgeProps) {
  const config = platformConfig[platform];
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full font-medium",
      config.gradient,
      config.textColor,
      sizeClasses[size]
    )}>
      <PlatformIcon platform={platform} size={iconSizes[size]} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
