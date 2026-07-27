import React from 'react';
import theme from '../../theme/theme';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses = {
  primary:
    `${theme.accent.primary} focus:ring-teal-400 disabled:bg-teal-500/50`,
  secondary:
    'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 focus:ring-slate-500 disabled:bg-slate-800/60',
  danger:
    'bg-red-500 text-white hover:bg-red-400 focus:ring-red-400 disabled:bg-red-500/50',
  ghost:
    'bg-transparent text-slate-300 hover:bg-slate-800 focus:ring-slate-500 disabled:text-slate-600',
};

const sizeClasses = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-3.5 py-2.5 text-sm sm:px-4 sm:text-base',
  lg: 'px-5 py-3 text-base sm:px-6 sm:text-lg',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled = false,
  children,
  className = '',
  ...props
}) => {
  return (
    <button
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center gap-2
        font-medium rounded-lg
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-offset-0
        disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {isLoading && (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
      )}
      {children}
    </button>
  );
};
