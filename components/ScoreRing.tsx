import { KPI_META, statusFor } from '@/lib/calc';

const CIRCUMFERENCE = 214;

export default function ScoreRing({ score }: { score: number | null }) {
  const offset = score === null ? CIRCUMFERENCE : CIRCUMFERENCE - (CIRCUMFERENCE * score) / 100;
  const status = statusFor(score, KPI_META.okr_total.meta);
  const fillClass = status === 'na' ? '' : ` ${status}`;
  return (
    <div>
      <div className="score-ring">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle className="track" cx="40" cy="40" r="34" />
          <circle
            className={`fill${fillClass}`}
            cx="40"
            cy="40"
            r="34"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="num">{score === null ? '—' : `${score.toFixed(0)}%`}</div>
      </div>
      <div className="score-label">Resultado OKR</div>
    </div>
  );
}
