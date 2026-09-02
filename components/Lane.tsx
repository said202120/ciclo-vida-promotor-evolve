import type { ReactNode } from 'react';

export default function Lane({
  owner,
  tag,
  emoji,
  title,
  weightLabel,
  score,
  children,
}: {
  owner: 'mesa' | 'ops' | 'cap';
  tag: string;
  emoji: string;
  title: string;
  weightLabel: string;
  score: number | null;
  children: ReactNode;
}) {
  return (
    <div className="lane" data-owner={owner}>
      <div className="lane-head">
        <div className="lane-head-left">
          <span className="lane-tag">{tag}</span>
          <span className="lane-emoji">{emoji}</span>
          <span className="lane-title">{title}</span>
        </div>
        <div>
          <div className="lane-score">{score === null ? '—' : `${score.toFixed(0)}%`}</div>
          <div className="lane-meta">{weightLabel}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
