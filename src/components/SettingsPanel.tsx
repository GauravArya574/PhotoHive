import React, { useState } from 'react';
import {
  LayoutSettings,
  VariationLevel,
  CANVAS_PRESETS,
  CanvasPreset,
} from '../types';
import {
  Sliders,
  RefreshCw,
  Download,
  Shuffle,
  Maximize,
  Check,
  Lock,
} from 'lucide-react';

interface SettingsPanelProps {
  settings: LayoutSettings;
  onChangeSettings: (settings: LayoutSettings) => void;
  onRegenerate: () => void;
  onExport: (format: 'png' | 'jpeg' | 'webp', quality: number) => Promise<void>;
  isGenerating: boolean;
  photoCount: number;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChangeSettings,
  onRegenerate,
  onExport,
  isGenerating,
  photoCount,
}) => {
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [exportQuality, setExportQuality] = useState<number>(95);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const handlePresetChange = (preset: CanvasPreset) => {
    onChangeSettings({
      ...settings,
      presetName: preset.name,
      canvasWidth: preset.width,
      canvasHeight: preset.height,
    });
  };

  const handleCustomDimensionChange = (w: number, h: number) => {
    onChangeSettings({
      ...settings,
      presetName: 'custom',
      canvasWidth: Math.max(200, Math.min(10000, w)),
      canvasHeight: Math.max(200, Math.min(10000, h)),
    });
  };

  const handleSwapDimensions = () => {
    onChangeSettings({
      ...settings,
      canvasWidth: settings.canvasHeight,
      canvasHeight: settings.canvasWidth,
    });
  };

  const handleNewRandomSeed = () => {
    const newSeed = Math.floor(Math.random() * 900000) + 100000;
    onChangeSettings({
      ...settings,
      seed: newSeed,
    });
  };

  const handleTriggerExport = async () => {
    try {
      setIsExporting(true);
      setExportSuccess(false);
      await onExport(exportFormat, exportQuality / 100);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (e) {
      alert((e as Error).message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <aside className="w-80 bg-[#121319] border-l border-[#22242f] flex flex-col h-full overflow-y-auto select-none text-zinc-300 text-xs">
      {/* Primary Action Header */}
      <div className="p-4 border-b border-[#22242f] space-y-3">
        <button
          onClick={onRegenerate}
          disabled={isGenerating || photoCount === 0}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-black font-bold py-3 px-4 rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Generating Layout...' : 'Regenerate Collage'}</span>
        </button>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {/* Canvas Dimension & Presets */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-white flex items-center gap-1.5">
              <Maximize className="w-3.5 h-3.5 text-amber-400" />
              <span>Canvas Preset</span>
            </label>
            <span className="font-mono text-[10px] text-zinc-500">
              {settings.canvasWidth} × {settings.canvasHeight}
            </span>
          </div>

          <select
            value={settings.presetName}
            onChange={e => {
              const p = CANVAS_PRESETS.find(item => item.name === e.target.value);
              if (p) handlePresetChange(p);
            }}
            className="w-full bg-[#1a1b24] border border-[#2d2f3e] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500"
          >
            {CANVAS_PRESETS.map(p => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Custom dimensions inputs */}
          {settings.presetName === 'custom' && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1">
                <span className="text-[10px] text-zinc-400 block mb-0.5">Width (px)</span>
                <input
                  type="number"
                  value={settings.canvasWidth}
                  onChange={e =>
                    handleCustomDimensionChange(parseInt(e.target.value) || 1920, settings.canvasHeight)
                  }
                  className="w-full bg-[#1a1b24] border border-[#2d2f3e] rounded px-2.5 py-1.5 font-mono text-zinc-200"
                  step="10"
                />
              </div>
              <button
                onClick={handleSwapDimensions}
                title="Swap Width and Height"
                className="mt-4 p-2 bg-[#1a1b24] hover:bg-[#252736] border border-[#2d2f3e] rounded text-zinc-400 hover:text-white"
              >
                ⇄
              </button>
              <div className="flex-1">
                <span className="text-[10px] text-zinc-400 block mb-0.5">Height (px)</span>
                <input
                  type="number"
                  value={settings.canvasHeight}
                  onChange={e =>
                    handleCustomDimensionChange(settings.canvasWidth, parseInt(e.target.value) || 1080)
                  }
                  className="w-full bg-[#1a1b24] border border-[#2d2f3e] rounded px-2.5 py-1.5 font-mono text-zinc-200"
                  step="10"
                />
              </div>
            </div>
          )}
        </div>

        {/* Packing & Sizing Sliders */}
        <div className="space-y-3.5 pt-2 border-t border-[#1f202b]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Geometry & Packing</span>
            </span>
          </div>

          {/* Size Variation */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-zinc-400">Photo Size Variation:</span>
              <span className="font-semibold text-amber-300 uppercase text-[10px] flex items-center gap-1">
                {settings.sizeVariation === 'low' && <Lock className="w-3 h-3 text-emerald-400 inline" />}
                {settings.sizeVariation === 'low'
                  ? 'Uniform (Locked 0.7×–1.3×)'
                  : settings.sizeVariation === 'medium'
                  ? 'Balanced (~1.8× area range)'
                  : 'Dynamic (~3.5× area range)'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-[#181922] p-1 rounded-lg border border-[#272938]">
              {([
                { id: 'low', label: 'Uniform', hint: '0.7–1.3× Locked' },
                { id: 'medium', label: 'Balanced', hint: 'Moderate' },
                { id: 'high', label: 'Dynamic', hint: 'High Range' },
              ] as { id: VariationLevel; label: string; hint: string }[]).map(lvl => (
                <button
                  key={lvl.id}
                  onClick={() => onChangeSettings({ ...settings, sizeVariation: lvl.id })}
                  className={`py-1.5 px-1 rounded text-center transition-colors ${
                    settings.sizeVariation === lvl.id
                      ? 'bg-amber-500 text-black font-bold'
                      : 'text-zinc-400 hover:text-white hover:bg-[#20222f]'
                  }`}
                >
                  <div className="text-[11px] font-semibold flex items-center justify-center gap-0.5">
                    {lvl.id === 'low' && <Lock className="w-2.5 h-2.5" />}
                    <span>{lvl.label}</span>
                  </div>
                  <div
                    className={`text-[9px] ${
                      settings.sizeVariation === lvl.id ? 'text-black/80' : 'text-zinc-500'
                    }`}
                  >
                    {lvl.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Randomness */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-zinc-400">Layout Randomness:</span>
              <span className="font-semibold text-amber-300 uppercase text-[10px]">
                {settings.randomness}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-[#181922] p-1 rounded-lg border border-[#272938]">
              {(['low', 'medium', 'high'] as VariationLevel[]).map(lvl => (
                <button
                  key={lvl}
                  onClick={() => onChangeSettings({ ...settings, randomness: lvl })}
                  className={`py-1 rounded text-center font-medium capitalize text-[11px] transition-colors ${
                    settings.randomness === lvl
                      ? 'bg-amber-500 text-black font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Spacing Selector */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-zinc-400">Spacing Between Photos:</span>
              <span className="font-mono text-white font-semibold">
                {settings.spacing === 0 ? '0 px (Zero Gap)' : `${settings.spacing} px`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {[0, 1, 2, 4, 8, 12, 20].map(px => (
                <button
                  key={px}
                  onClick={() => onChangeSettings({ ...settings, spacing: px })}
                  className={`flex-1 py-1 rounded text-center font-mono text-[11px] border transition-colors ${
                    settings.spacing === px
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                      : 'bg-[#181922] border-[#272938] text-zinc-400 hover:text-white'
                  }`}
                >
                  {px}p
                </button>
              ))}
            </div>
          </div>

          {/* Background Color */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-zinc-400">Background Color:</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { label: 'Black', value: '#0a0a0c' },
                { label: 'White', value: '#ffffff' },
                { label: 'Slate', value: '#1e293b' },
                { label: 'None', value: 'transparent' },
              ].map(bg => (
                <button
                  key={bg.value}
                  onClick={() => onChangeSettings({ ...settings, backgroundColor: bg.value })}
                  className={`flex-1 py-1 px-1.5 rounded text-[11px] border transition-colors flex items-center justify-center gap-1 ${
                    settings.backgroundColor === bg.value
                      ? 'border-amber-500 bg-amber-500/10 text-white font-bold'
                      : 'border-[#272938] bg-[#181922] text-zinc-400 hover:text-white'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-zinc-600 shrink-0"
                    style={{ backgroundColor: bg.value === 'transparent' ? 'transparent' : bg.value }}
                  />
                  <span>{bg.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Seed Input & Shuffle */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-zinc-400">Composition Seed:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={settings.seed}
                onChange={e =>
                  onChangeSettings({ ...settings, seed: parseInt(e.target.value) || 123456 })
                }
                className="flex-1 bg-[#181922] border border-[#272938] rounded-lg px-3 py-1.5 font-mono text-zinc-200"
              />
              <button
                onClick={handleNewRandomSeed}
                title="Generate New Random Seed"
                className="p-2 bg-[#1a1b26] hover:bg-[#262838] border border-[#2c2e40] rounded-lg text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* High-Resolution Export Card */}
        <div className="space-y-3 pt-3 border-t border-[#1f202b]">
          <label className="font-semibold text-white flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>High-Resolution Export</span>
          </label>

          <div className="bg-[#181922] border border-[#272938] p-3 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Output Dimension:</span>
              <span className="font-mono text-white font-semibold">
                {settings.canvasWidth} × {settings.canvasHeight} px
              </span>
            </div>

            {/* Format buttons */}
            <div className="grid grid-cols-3 gap-1 bg-[#121318] p-1 rounded-lg border border-[#22242f]">
              {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setExportFormat(fmt)}
                  className={`py-1 rounded text-center uppercase font-bold text-[10px] transition-colors ${
                    exportFormat === fmt
                      ? 'bg-amber-500 text-black shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            {/* Quality Slider for JPEG / WebP */}
            {exportFormat !== 'png' && (
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Compression Quality:</span>
                  <span className="font-mono text-white font-semibold">{exportQuality}%</span>
                </div>
                <input
                  type="range"
                  min="70"
                  max="100"
                  value={exportQuality}
                  onChange={e => setExportQuality(parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
            )}

            <button
              onClick={handleTriggerExport}
              disabled={isExporting || photoCount === 0}
              className="w-full bg-[#202230] hover:bg-[#2a2c3e] border border-amber-500/30 hover:border-amber-500/60 disabled:opacity-50 text-amber-300 font-semibold py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer text-xs"
            >
              {isExporting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              ) : exportSuccess ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Download className="w-4 h-4 text-amber-400" />
              )}
              <span>
                {isExporting
                  ? 'Rendering Full Res...'
                  : exportSuccess
                  ? 'Export Downloaded!'
                  : `Export ${settings.canvasWidth}×${settings.canvasHeight} ${exportFormat.toUpperCase()}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
