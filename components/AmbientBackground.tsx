'use client';

import { useEffect, useRef, useState } from 'react';

// Motivo ambiental: anillos orbitando (el "ciclo") con puntos que recorren
// cada órbita (el "promotor" en su trayecto) — eco visual del nombre del
// proyecto, puramente decorativo detrás de las tarjetas blancas.
const CENTER = { cx: 1260, cy: 90 };

const RINGS = [
  { r: 300, color: 'var(--accent)', duration: '150s', reverse: false },
  { r: 220, color: 'var(--mesa)', duration: '110s', reverse: true },
  { r: 150, color: 'var(--cap)', duration: '75s', reverse: false },
];

const TRAVELERS = [
  { r: 300, color: 'var(--accent)', dur: '26s', begin: '0s' },
  { r: 300, color: 'var(--ops)', dur: '26s', begin: '-13s' },
  { r: 220, color: 'var(--mesa)', dur: '19s', begin: '-5s' },
  { r: 220, color: 'var(--accent)', dur: '19s', begin: '-14s' },
  { r: 150, color: 'var(--cap)', dur: '14s', begin: '-7s' },
];

function orbitPath(r: number) {
  const { cx, cy } = CENTER;
  return `M ${cx + r},${cy} a ${r},${r} 0 1,1 ${-2 * r},0 a ${r},${r} 0 1,1 ${2 * r},0`;
}

export default function AmbientBackground() {
  const parallaxRef = useRef<HTMLDivElement>(null);
  const [motionOk, setMotionOk] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMotionOk(!mq.matches);
  }, []);

  useEffect(() => {
    let raf = 0;
    function onMove(e: MouseEvent) {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const mx = e.clientX / window.innerWidth - 0.5;
        const my = e.clientY / window.innerHeight - 0.5;
        parallaxRef.current?.style.setProperty('--mx', mx.toFixed(3));
        parallaxRef.current?.style.setProperty('--my', my.toFixed(3));
      });
    }
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="ambient-orb mesa" />
      <div className="ambient-orb ops" />
      <div className="ambient-orb cap" />

      <svg className="ambient-path-line" preserveAspectRatio="none" viewBox="0 0 100 100">
        <line x1="0" y1="0" x2="100" y2="100" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="ambient-parallax" ref={parallaxRef}>
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
          {RINGS.map((ring, i) => (
            <g
              key={i}
              className={motionOk ? `ambient-ring${ring.reverse ? ' reverse' : ''}` : ''}
              style={{ animationDuration: ring.duration, transformOrigin: `${CENTER.cx}px ${CENTER.cy}px` }}
            >
              <circle cx={CENTER.cx} cy={CENTER.cy} r={ring.r} fill="none" stroke={ring.color} strokeWidth={1.4} opacity={0.1} />
            </g>
          ))}
          {TRAVELERS.map((t, i) => (
            <circle key={i} cx={CENTER.cx + t.r} cy={CENTER.cy} r={4.5} fill={t.color} opacity={0.42}>
              {motionOk && <animateMotion dur={t.dur} begin={t.begin} repeatCount="indefinite" path={orbitPath(t.r)} />}
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}
