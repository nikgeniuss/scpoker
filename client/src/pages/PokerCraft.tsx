import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { formatMoney } from '../config/chipFormat';
import { useHandsChart, type ChartPoint } from '../hooks/useHandsChart';

// При тысячах раздач в 320px несколько точек ложатся на один пиксель — резкий свинг за
// пару раздач рисуется вертикальной «стеной». Даунсэмплим до разумного числа точек
// (равномерно по индексу, первая/последняя точка сохраняются всегда).
const MAX_CHART_POINTS = 150;
function downsample(data: ChartPoint[], maxPoints: number): ChartPoint[] {
  if (data.length <= maxPoints) return data;
  const step = (data.length - 1) / (maxPoints - 1);
  const out: ChartPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(data[Math.round(i * step)]);
  }
  return out;
}

// Простой SVG-график кумулятивного PnL (без recharts).
function BankrollChart({ data: rawData }: { data: ChartPoint[] }) {
  const { t } = useTranslation();
  const W = 320, H = 120, PAD = 12;
  if (rawData.length < 2) {
    return (
      <div className="h-[120px] flex items-center justify-center text-white/20 text-sm">
        {t('pokerCraft.notEnoughData')}
      </div>
    );
  }
  const data = downsample(rawData, MAX_CHART_POINTS);
  const minY = Math.min(...data.map(d => d.cumPnL));
  const maxY = Math.max(...data.map(d => d.cumPnL));
  const rangeY = maxY - minY || 1;
  const scaleX = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const scaleY = (v: number) => H - PAD - ((v - minY) / rangeY) * (H - PAD * 2);
  const pts = data.map((d, i) => `${scaleX(i)},${scaleY(d.cumPnL)}`).join(' ');
  const last = data[data.length - 1];
  const isPositive = last.cumPnL >= 0;
  const color = isPositive ? '#10b981' : '#f87171';
  // Area fill
  const area = `M${scaleX(0)},${scaleY(data[0].cumPnL)} ` +
    data.slice(1).map((d, i) => `L${scaleX(i + 1)},${scaleY(d.cumPnL)}`).join(' ') +
    ` L${scaleX(data.length - 1)},${H - PAD} L${scaleX(0)},${H - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Нулевая линия */}
      <line
        x1={PAD} y1={scaleY(0)}
        x2={W - PAD} y2={scaleY(0)}
        stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 4"
      />
      <path d={area} fill="url(#cg)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function PokerCraft() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, totalHands, totalPnL, loading } = useHandsChart();
  const isPositive = totalPnL >= 0;

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
    <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-14 pb-4">
        <button onClick={() => navigate('/profile')} className="text-white/40 hover:text-white/80 mr-1">
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <span className="text-lg font-bold">PokerCraft</span>
      </div>

      {/* Итоговые метрики */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-white/40 text-xs mb-1">{t('pokerCraft.hands')}</div>
          <div className="text-2xl font-black">{totalHands}</div>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-white/40 text-xs mb-1">PnL</div>
          <div className={`text-2xl font-black ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}{formatMoney(totalPnL)}
          </div>
        </div>
      </div>

      {/* График */}
      <div className="mx-4 rounded-2xl bg-white/5 p-4 mb-4">
        <div className="text-white/40 text-xs mb-3">{t('pokerCraft.bankrollDynamics')}</div>
        {loading ? (
          <div className="h-[120px] flex items-center justify-center text-white/20 text-sm">
            {t('pokerCraft.loading')}
          </div>
        ) : (
          <BankrollChart data={data} />
        )}
      </div>

      <div className="pb-24" />
    </div>
    </div>
  );
}
