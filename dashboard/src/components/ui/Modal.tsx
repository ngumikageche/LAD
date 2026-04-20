import React from 'react';
import { X } from 'lucide-react';

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
      <div className="fixed inset-0 bg-black/50 transition-opacity" />

      {/* Modal Container */}
      <div className="flex items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8 py-12">
        <div
          className={`relative bg-white rounded-lg shadow-xl transform transition-all w-full ${sizeClasses[size]}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              {description && (
                <p className="mt-1 text-sm text-gray-500">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close modal"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">{children}</div>
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
  <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 ${className}`}>
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
