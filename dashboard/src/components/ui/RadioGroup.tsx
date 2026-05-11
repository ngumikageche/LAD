import React from 'react';

interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface RadioGroupProps {
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  orientation?: 'vertical' | 'horizontal';
  size?: 'sm' | 'md' | 'lg';
  error?: string;
  helperText?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const textSizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  options,
  value,
  onChange,
  orientation = 'vertical',
  size = 'md',
  error,
  helperText,
}) => {
  const containerClass =
    orientation === 'horizontal' ? 'flex flex-wrap gap-6' : 'space-y-3';

  return (
    <fieldset>
      <div className={containerClass}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-3 cursor-pointer ${
              option.disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange(e.target.value)}
              disabled={option.disabled}
              className={`${sizeClasses[size]} accent-indigo-600 mt-1 cursor-pointer`}
            />
            <div className="flex flex-col gap-1">
              <span className={`font-medium text-slate-100 ${textSizeClasses[size]}`}>
                {option.label}
              </span>
              {option.description && (
                <span className="text-sm text-slate-400">
                  {option.description}
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      {helperText && !error && (
        <p className="mt-2 text-sm text-slate-400">{helperText}</p>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </fieldset>
  );
};

interface SingleRadioProps {
  name: string;
  label: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Radio: React.FC<SingleRadioProps> = ({
  name,
  label,
  value,
  checked,
  onChange,
  description,
  disabled = false,
  size = 'md',
}) => {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={`${sizeClasses[size]} accent-indigo-600 mt-1 cursor-pointer`}
      />
      <div className="flex flex-col gap-1">
        <span className={`font-medium text-slate-100 ${textSizeClasses[size]}`}>
          {label}
        </span>
        {description && (
          <span className="text-sm text-slate-400">{description}</span>
        )}
      </div>
    </label>
  );
};
