'use client';

/**
 * components/StyleSelector.tsx
 * 卡通风格选择组件
 * 提供4种风格选择卡片，带有选中状态和悬停效果
 */

import { STYLE_OPTIONS } from '@/lib/constants';
import { CartoonStyle, StyleOption } from '@/lib/types';

interface StyleSelectorProps {
  /** 当前选中的风格 */
  value: CartoonStyle;
  /** 风格变化回调 */
  onChange: (style: CartoonStyle) => void;
  /** 是否禁用选择 */
  disabled?: boolean;
}

export function StyleSelector({ value, onChange, disabled }: StyleSelectorProps) {
  return (
    <div className="w-full">
      {/* 标签 */}
      <label className="block text-sm font-semibold text-gray-700 mb-4">
        Choose Your Style
      </label>

      {/* 风格选项网格 - 响应式：移动端2列，平板以上4列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STYLE_OPTIONS.map((option) => (
          <StyleCard
            key={option.id}
            option={option}
            isSelected={value === option.id}
            onClick={() => !disabled && onChange(option.id)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 单个风格卡片组件
 */
interface StyleCardProps {
  option: StyleOption;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function StyleCard({ option, isSelected, onClick, disabled }: StyleCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        relative p-4 rounded-2xl text-left
        transition-all duration-300 ease-out
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:shadow-lg active:scale-98'}
        ${isSelected
          ? 'bg-blue-50 border-2 border-blue-500 shadow-md ring-2 ring-blue-200'
          : 'bg-white border-2 border-gray-200 hover:border-blue-300'
        }
      `}
    >
      {/* Emoji图标 */}
      <div className={`
        text-3xl mb-3 transition-transform duration-300
        ${isSelected ? 'scale-110' : ''}
      `}>
        {option.emoji}
      </div>

      {/* 名称 */}
      <h3 className={`
        font-semibold text-sm mb-1
        ${isSelected ? 'text-blue-700' : 'text-gray-800'}
      `}>
        {option.name}
      </h3>

      {/* 描述 */}
      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
        {option.description}
      </p>

      {/* 选中标记 */}
      {isSelected && (
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>
      )}
    </button>
  );
}