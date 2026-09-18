import React from 'react';
import { LayoutResult, LayoutSettings } from '../types';
import { CheckCircle2, AlertTriangle, XCircle, Bug, Copy } from 'lucide-react';

interface DebugModalProps {
  layoutResult: LayoutResult | null;
  settings: LayoutSettings;
  photoCount: number;
  isOpen: boolean;
  onClose: () => void;
  debugOverlay: boolean;
  onToggleDebugOverlay: () => void;
}

export const DebugModal: React.FC<DebugModalProps> = ({
  layoutResult,
  settings,
  photoCount,
  isOpen,
  onClose,
  debugOverlay,
  onToggleDebugOverlay,
}) => {
  if (!isOpen) return null;

  const sanity = layoutResult?.sanityCheck;
  const score = layoutResult?.score;
  const placements = layoutResult?.placements || [];
  const targetArea = (settings.canvasWidth * settings.canvasHeight) / Math.max(1, photoCount);
  const areas = placements.map(p => {
    const cellW = settings.spacing > 0 ? p.width + settings.spacing : p.width;
    const cellH = settings.spacing > 0 ? p.height + settings.spacing : p.height;
    return cellW * cellH;
  });
  const minAreaRatio = areas.length > 0 ? Math.min(...areas) / targetArea : 1;
  const maxAreaRatio = areas.length > 0 ? Math.max(...areas) / targetArea : 1;

  const copyDiagnosticJson = () => {
    if (!layoutResult) return;
    const dump = {
      canvas: { width: settings.canvasWidth, height: settings.canvasHeight },
      settings,
      score: layoutResult.score,
      coverage: layoutResult.coverage,
      sanity: layoutResult.sanityCheck,
      placementsCount: layoutResult.placements.length,
      samplePlacements: layoutResult.placements.slice(0, 10),
    };
    navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
    alert('Diagnostics JSON copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-[#161720] border border-[#2d2f3e] rounded-xl max-w-xl w-full p-6 text-zinc-200 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#282a38]">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Bug className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-white text-base">Layout Inspector & Sanity Engine</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white px-2 py-1">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto py-4 space-y-4 text-xs">
          {/* Debug overlay toggle */}
          <div className="flex items-center justify-between bg-[#111218] p-3 rounded-lg border border-[#232532]">
            <div>
              <span className="font-semibold text-white block">Visual Canvas Bounding Boxes</span>
              <span className="text-[11px] text-zinc-400">
                Overlay rectangle borders, anchor tags, and dimensions directly onto the preview
              </span>
            </div>
            <button
              onClick={onToggleDebugOverlay}
              className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors ${
                debugOverlay
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#232533] text-zinc-300 hover:text-white'
              }`}
            >
              {debugOverlay ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Sanity Checks List */}
          <div className="space-y-2">
            <span className="font-bold text-white uppercase text-[10px] tracking-wider text-zinc-400">
              Automated Geometric Sanity Verification
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-[#1a1b24] border border-[#2c2e3e] p-3 rounded-lg flex items-center gap-2.5">
                {sanity?.hasCollisions ? (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-white">Collision Check</div>
                  <div className="text-[10px] text-zinc-400">
                    {sanity?.hasCollisions ? 'Overlaps detected' : '0 overlapping rectangles'}
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1b24] border border-[#2c2e3e] p-3 rounded-lg flex items-center gap-2.5">
                {sanity?.hasOutOfBounds ? (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-white">Boundary Containment</div>
                  <div className="text-[10px] text-zinc-400">
                    {sanity?.hasOutOfBounds ? 'Out of bounds detected' : 'Strictly within canvas [0, W, H]'}
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1b24] border border-[#2c2e3e] p-3 rounded-lg flex items-center gap-2.5">
                {sanity?.hasDistortion ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-white">Aspect Ratio Fidelity</div>
                  <div className="text-[10px] text-zinc-400">
                    {sanity?.hasDistortion ? 'Distortion detected' : 'Exact original ratios preserved'}
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1b24] border border-[#2c2e3e] p-3 rounded-lg flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Photo Placement Count</div>
                  <div className="text-[10px] text-zinc-400">
                    {layoutResult?.placements.length} of {photoCount} photos placed
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1b24] border border-[#2c2e3e] p-3 rounded-lg flex items-center gap-2.5">
                {settings.sizeVariation === 'low' && (minAreaRatio < 0.695 || maxAreaRatio > 1.305) ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-white">Scale Factor Lock (.7 to 1.3)</div>
                  <div className="text-[10px] text-zinc-400">
                    Range: {minAreaRatio.toFixed(2)}× to {maxAreaRatio.toFixed(2)}× • {settings.sizeVariation === 'low' ? 'Locked [0.70x, 1.30x]' : 'Unlocked'}
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1b24] border border-[#2c2e3e] p-3 rounded-lg flex items-center gap-2.5">
                {(score?.coverage || 0) >= 0.96 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-white">Coverage Threshold (≥ 96%)</div>
                  <div className="text-[10px] text-zinc-400">
                    Achieved: {layoutResult ? layoutResult.coverage : 0}% • Requirement: ≥ 96.0%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Aesthetic Scores Matrix */}
          {score && (
            <div className="space-y-2 pt-2 border-t border-[#232532]">
              <span className="font-bold text-white uppercase text-[10px] tracking-wider text-zinc-400">
                Aesthetic Scoring Breakdown
              </span>

              <div className="bg-[#111218] p-3 rounded-lg border border-[#232532] space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Total Aesthetic Score:</span>
                  <span className="text-amber-400 font-bold">{score.totalScore.toFixed(1)} / 100</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Canvas Coverage:</span>
                  <span className="text-white">{(score.coverage * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Aspect Fidelity:</span>
                  <span className="text-white">{(score.aspectRatioFidelity * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Size Distribution:</span>
                  <span className="text-white">
                    {((score.sizeDistributionScore ?? score.sizeDiversity ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Anchor Distribution:</span>
                  <span className="text-white">{(score.anchorDistribution * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Execution Time:</span>
                  <span className="text-white">{layoutResult?.executionTimeMs} ms</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#282a38]">
          <button
            onClick={copyDiagnosticJson}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs bg-[#20222f] px-3 py-1.5 rounded-md transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Diagnostics JSON</span>
          </button>

          <button
            onClick={onClose}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs px-4 py-1.5 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
