'use client';

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { SetupWizard } from './setup-wizard';

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountAdded?: () => void;
}

export function AddAccountDialog({
  open,
  onOpenChange,
  onAccountAdded,
}: AddAccountDialogProps) {
  const handleComplete = () => {
    onOpenChange(false);
    if (onAccountAdded) onAccountAdded();
    else window.location.reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-3xl border-0">
        <SetupWizard
          onComplete={handleComplete}
          onCancel={() => onOpenChange(false)}
          compact
        />
      </DialogContent>
    </Dialog>
  );
}
