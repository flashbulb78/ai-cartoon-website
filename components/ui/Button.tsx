'use client';

/**
 * components/ui/Button.tsx
 * 通用按钮组件
 * 支持多种变体、尺寸和加载状态
 */

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按钮样式变体 */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  /** 按钮尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否显示加载状态 */
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    // 基础样式
    const baseStyles = `
      inline-flex items-center justify-center font-semibold rounded-xl
      transition-all duration-200 ease-out
      disabled:opacity-50 disabled:cursor-not-allowed
      focus:outline-none focus:ring-2 focus:ring-offset-2
      active:scale-95
    `;

    // 变体样式
    const variantStyles = {
      primary: `
        bg-blue-500 hover:bg-blue-600 text-white
        focus:ring-blue-500
        shadow-md shadow-blue-500/20
        hover:shadow-lg hover:shadow-blue-500/30
      `,
      secondary: `
        bg-gray-100 hover:bg-gray-200 text-gray-800
        focus:ring-gray-500
      `,
      outline: `
        border-2 border-gray-300 hover:border-gray-400 text-gray-700
        focus:ring-gray-500 bg-transparent hover:bg-gray-50
      `,
      ghost: `
        text-gray-600 hover:text-gray-800 hover:bg-gray-100
        focus:ring-gray-500
      `,
    };

    // 尺寸样式
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs rounded-lg',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base rounded-xl',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

// 设置组件名称（用于调试）
Button.displayName = 'Button';