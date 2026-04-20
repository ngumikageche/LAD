import React from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  helperText,
  required = false,
  children,
}) => {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-900">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {helperText && !error && (
        <p className="text-sm text-gray-600">{helperText}</p>
      )}
    </div>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input: React.FC<InputProps> = ({
  error = false,
  className = '',
  ...props
}) => {
  return (
    <input
      className={`
        w-full px-4 py-2
        border rounded-lg
        text-gray-900 placeholder-gray-400
        transition-colors
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
        disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-600
        ${error ? 'border-red-500' : 'border-gray-300'}
        ${className}
      `}
      {...props}
    />
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export const Select: React.FC<SelectProps> = ({
  error = false,
  options = [],
  children,
  className = '',
  ...props
}) => {
  return (
    <select
      className={`
        w-full px-4 py-2
        border rounded-lg
        text-gray-900 bg-white
        transition-colors
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
        disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-600
        ${error ? 'border-red-500' : 'border-gray-300'}
        ${className}
      `}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
};

interface TextAreaProps extends React.TextAreaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const TextArea: React.FC<TextAreaProps> = ({
  error = false,
  className = '',
  ...props
}) => {
  return (
    <textarea
      className={`
        w-full px-4 py-2
        border rounded-lg
        text-gray-900 placeholder-gray-400
        transition-colors
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
        disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-600
        resize-vertical
        ${error ? 'border-red-500' : 'border-gray-300'}
        ${className}
      `}
      {...props}
    />
  );
};
