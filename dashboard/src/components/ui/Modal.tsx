import React from 'react';
import { X } from 'lucide-react';
import theme from '../../theme/theme';

interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdropClick?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  description,
  onClose,
  children,
  size = 'md',
  closeOnBackdropClick = true,
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className={`fixed inset-0 ${theme.surface.overlay} transition-opacity`} />

      {/* Modal Container */}
      <div className="flex min-h-dvh items-end justify-center px-0 py-0 sm:items-center sm:px-6 sm:py-8 lg:px-8">
        <div
          className={`relative flex max-h-dvh w-full flex-col overflow-hidden rounded-b-none shadow-2xl transition-all sm:max-h-[calc(100dvh-4rem)] sm:rounded-lg ${theme.surface.card} ${sizeClasses[size]}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-xl font-bold text-slate-100">{title}</h2>
              {description && (
                <p className="mt-1 text-sm text-slate-400">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-200 transition-all duration-200"
              aria-label="Close modal"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  children,
  className = '',
}) => (
  <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 ${className}`}>
    {children}
  </div>
);

interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

export const ModalBody: React.FC<ModalBodyProps> = ({
  children,
  className = '',
}) => <div className={`px-6 py-4 ${className}`}>{children}</div>;
