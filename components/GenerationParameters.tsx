'use client';

/**
 * components/GenerationParameters.tsx
 * Collapsible advanced parameters panel
 * Hidden by default, user can expand to fine-tune
 */

import { useState } from 'react';

interface GenerationParametersProps {
  /** Face similarity strength (0.5-1.0) - higher = more like original face */
  faceSimilarity: number;
  /** Style strength (0-1) - higher = more stylized */
  styleStrength: number;
  /** Fidelity/Restoration (0-1) - higher = more faithful to original */
  fidelity: number;
  /** Callback when face similarity changes */
  onFaceSimilarityChange: (value: number) => void;
  /** Callback when style strength changes */
  onStyleStrengthChange: (value: number) => void;
  /** Callback when fidelity changes */
  onFidelityChange: (value: number) => void;
  /** Whether controls are disabled */
  disabled?: boolean;
}

export function GenerationParameters({
  faceSimilarity,
  styleStrength,
  fidelity,
  onFaceSimilarityChange,
  onStyleStrengthChange,
  onFidelityChange,
  disabled,
}: GenerationParametersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-2xl"
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
            🎛️
          </span>
          <span className="text-base font-semibold text-gray-800">Advanced Parameters</span>
          <span className="text-xs text-gray-400">(Optional fine-tuning)</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Face Similarity Slider - 0.5 to 1.0 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="text-lg">👤</span>
                Face Similarity
              </label>
              <span className="text-sm font-semibold text-blue-600">
                {Math.round(faceSimilarity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              value={faceSimilarity * 100}
              onChange={(e) => onFaceSimilarityChange(parseInt(e.target.value) / 100)}
              disabled={disabled}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Cartoon style</span>
              <span>Realistic face</span>
            </div>
          </div>

          {/* Style Strength Slider - 0.2 to 0.8 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="text-lg">🎨</span>
                Style Strength
              </label>
              <span className="text-sm font-semibold text-purple-600">
                {Math.round(styleStrength * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="80"
              value={styleStrength * 100}
              onChange={(e) => onStyleStrengthChange(parseInt(e.target.value) / 100)}
              disabled={disabled}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Original look</span>
              <span>Strong style</span>
            </div>
          </div>

          {/* Fidelity/Restoration Slider - 0.4 to 1.0 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="text-lg">✨</span>
                Fidelity
              </label>
              <span className="text-sm font-semibold text-green-600">
                {Math.round(fidelity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="40"
              max="100"
              value={fidelity * 100}
              onChange={(e) => onFidelityChange(parseInt(e.target.value) / 100)}
              disabled={disabled}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Creative mode</span>
              <span>True to original</span>
            </div>
          </div>

          {/* Info tooltip */}
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-700">
              <strong>Tip:</strong> Higher face similarity ensures the generated avatar looks like you.
              Style strength controls how stylized the result appears. Fidelity maintains original features.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}