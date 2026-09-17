import React, { useState } from 'react';
import { LayoutResult, LayoutSettings } from '../types';
import {
  Sparkles,
  Layers,
  Copy,
  Check,
  ShieldCheck,
  Save,
  FolderUp,
  Bug,
  HelpCircle,
} from 'lucide-react';

interface HeaderProps {
  photoCount: number;
  layoutResult: LayoutResult | null;
  settings: LayoutSettings;
  onLoadSamplePack: (count: number) => void;
  onSaveProject: () => void;
  onLoadProject: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleDebug: () => void;
  debugMode: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  photoCount,
  layoutResult,
  settings,
  onLoadSamplePack,
  onSaveProject,
  onLoadProject,
  onToggleDebug,
  debugMode,
}) => {
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleCopySeed = () => {
    if (layoutResult?.seed) {
      navigator.clipboard.writeText(String(layoutResult.seed));
      setCopiedSeed(true);
      setTimeout(() => setCopiedSeed(false), 2000);
    }
  };

  const canvasAspect = (settings.canvasWidth / settings.canvasHeight).toFixed(2);

  return (
    <header className="bg-[#121318] border-b border-[#22242d] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 select-none">
      {/* Brand & Identity */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center shadow-md shadow-orange-500/20">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-white tracking-wide">PhotoHive</h1>
            <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Mosaic Engine
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 hidden sm:block">
            Dense, uncropped aspect-ratio preserving photo wall
          </p>
        </div>
      </div>

      {/* Live Metadata & Statistics */}
      {layoutResult && layoutResult.placements.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="bg-[#1a1b23] border border-[#2d2f3c] px-2.5 py-1 rounded-md text-zinc-300 flex items-center gap-1.5">
            <span className="text-zinc-500 font-medium">Photos:</span>
            <span className="font-semibold text-white">
              {layoutResult.placements.length} / {photoCount}
            </span>
          </div>

          <div className="bg-[#1a1b23] border border-[#2d2f3c] px-2.5 py-1 rounded-md text-zinc-300 flex items-center gap-1.5">
            <span className="text-zinc-500 font-medium">Canvas:</span>
            <span className="font-semibold text-white">
              {settings.canvasWidth}×{settings.canvasHeight}
            </span>
            <span className="text-zinc-400 text-[10px]">({canvasAspect}:1)</span>
          </div>

          <div className="bg-[#1a1b23] border border-[#2d2f3c] px-2.5 py-1 rounded-md text-zinc-300 flex items-center gap-1.5">
            <span className="text-zinc-500 font-medium">Coverage:</span>
            <span className="font-semibold text-emerald-400">{layoutResult.coverage}%</span>
          </div>

          <div className="bg-[#1a1b23] border border-[#2d2f3c] px-2.5 py-1 rounded-md text-zinc-300 flex items-center gap-1.5">
            <span className="text-zinc-500 font-medium">Seed:</span>
            <span className="font-mono text-amber-300 font-medium">{layoutResult.seed}</span>
            <button
              onClick={handleCopySeed}
              title="Copy Seed"
              className="text-zinc-400 hover:text-white transition-colors ml-0.5"
            >
              {copiedSeed ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Actions & Tools */}
      <div className="flex items-center gap-2">
        {/* Sample Packs Quick Trigger */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 bg-[#1e2029] hover:bg-[#282a36] text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/50 px-3 py-1.5 rounded-md text-xs font-medium transition-all shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Load Samples</span>
          </button>
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#181920] border border-[#2a2c38] rounded-lg shadow-xl shadow-black/60 py-1.5 hidden group-hover:block z-50">
            <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Artistic Sample Packs
            </div>
            <button
              onClick={() => onLoadSamplePack(24)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-[#252733] hover:text-white flex items-center justify-between"
            >
              <span>24 Photos (Portraits & Vistas)</span>
              <span className="text-[10px] text-zinc-500">Fast</span>
            </button>
            <button
              onClick={() => onLoadSamplePack(60)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-[#252733] hover:text-white flex items-center justify-between"
            >
              <span>60 Photos (Dense Nature Wall)</span>
              <span className="text-[10px] text-amber-400/80">Balanced</span>
            </button>
            <button
              onClick={() => onLoadSamplePack(120)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-[#252733] hover:text-white flex items-center justify-between"
            >
              <span>120 Photos (Epic PhotoHive)</span>
              <span className="text-[10px] text-rose-400/80">Dense</span>
            </button>
            <button
              onClick={() => onLoadSamplePack(200)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-[#252733] hover:text-white flex items-center justify-between"
            >
              <span>200 Photos (Mega Mosaic)</span>
              <span className="text-[10px] text-purple-400/80">Massive</span>
            </button>
          </div>
        </div>

        {/* Save Project */}
        <button
          onClick={onSaveProject}
          title="Save Project JSON"
          disabled={photoCount === 0}
          className="p-1.5 bg-[#1a1b23] hover:bg-[#242632] disabled:opacity-40 text-zinc-300 hover:text-white border border-[#2d2f3c] rounded-md transition-colors"
        >
          <Save className="w-4 h-4" />
        </button>

        {/* Load Project */}
        <label
          title="Load Project JSON"
          className="p-1.5 bg-[#1a1b23] hover:bg-[#242632] text-zinc-300 hover:text-white border border-[#2d2f3c] rounded-md transition-colors cursor-pointer"
        >
          <FolderUp className="w-4 h-4" />
          <input type="file" accept=".json" onChange={onLoadProject} className="hidden" />
        </label>

        {/* Debug Sanity Toggle */}
        <button
          onClick={onToggleDebug}
          title="Toggle Layout Inspector & Sanity Overlay"
          className={`p-1.5 border rounded-md transition-colors ${
            debugMode
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              : 'bg-[#1a1b23] hover:bg-[#242632] text-zinc-400 hover:text-zinc-200 border-[#2d2f3c]'
          }`}
        >
          <Bug className="w-4 h-4" />
        </button>

        {/* Help Info Dialog */}
        <button
          onClick={() => setShowHelp(prev => !prev)}
          title="About PhotoHive"
          className="p-1.5 bg-[#1a1b23] hover:bg-[#242632] text-zinc-400 hover:text-zinc-200 border border-[#2d2f3c] rounded-md transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#181920] border border-[#2d2f3d] rounded-xl max-w-lg w-full p-6 text-zinc-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#282a36]">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-white text-base">About PhotoHive Engine</h3>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="text-zinc-400 hover:text-white text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 py-4 text-xs text-zinc-300 leading-relaxed">
              <p>
                <strong className="text-white">PhotoHive</strong> is an automatic, dense photo mosaic
                maker that packs 50 to 500+ photographs into an organic wall while preserving the
                exact aspect ratio of every photograph with zero cropping and zero default gaps.
              </p>
              <div className="bg-[#121318] p-3 rounded-lg border border-[#232530] space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>100% Client-Side Local Privacy</span>
                </div>
                <p className="text-zinc-400 text-[11px]">
                  Your photos never leave your device. All packing algorithms, preview rendering, and
                  high-resolution wallpaper exports execute completely in your browser.
                </p>
              </div>
              <ul className="list-disc list-inside space-y-1 text-zinc-400">
                <li>Stochastic candidate generation and aesthetic scoring</li>
                <li>Anchor photos distributed naturally across 9 canvas sectors</li>
                <li>Full HD, QHD, 4K UHD, and 8K UHD direct exports</li>
                <li>Interactive photo selection and swapping</li>
              </ul>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#282a36]">
              <button
                onClick={() => setShowHelp(false)}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs px-4 py-2 rounded-md transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
