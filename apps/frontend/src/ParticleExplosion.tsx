import React, { useEffect, useRef } from 'react';

interface ParticleExplosionProps {
  x: number;
  y: number;
  color?: string;
  onEnd?: () => void;
}

const PARTICLE_COUNT = 28;
const DUST_COUNT = 16;
const COLORS = [
  ['#fffbe6', '#ffe066', '#5bc0ff', '#a685ff', 'rgba(255,255,255,0)'],
  ['#fff', '#ffe066', '#ff6b6b', '#ffe066', 'rgba(255,255,255,0)'],
  ['#fff', '#51ffb0', '#5bc0ff', '#a685ff', 'rgba(255,255,255,0)'],
];
const DUST_COLORS = ['#fff', '#b3e0ff', '#a685ff', '#e0e0ff'];

function lerpColor(a: string, b: string, t: number) {
  function parse(c: string) {
    if (c.startsWith('#')) {
      const n = c.length === 7 ? 2 : 1;
      return [
        parseInt(c.substr(1, n), 16),
        parseInt(c.substr(1 + n, n), 16),
        parseInt(c.substr(1 + 2 * n, n), 16),
        1
      ];
    } else if (c.startsWith('rgba')) {
      return c.match(/\d+\.?\d*/g)!.map(Number);
    } else if (c.startsWith('rgb')) {
      const arr = c.match(/\d+/g)!.map(Number); arr.push(1); return arr;
    }
    return [255,255,255,1];
  }
  const ca = parse(a), cb = parse(b);
  return `rgba(${Math.round(ca[0] + (cb[0]-ca[0])*t)},${Math.round(ca[1] + (cb[1]-ca[1])*t)},${Math.round(ca[2] + (cb[2]-ca[2])*t)},${ca[3] + (cb[3]-ca[3])*t})`;
}

export default function ParticleExplosion({ x, y, color, onEnd }: ParticleExplosionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 140;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx!.scale(dpr, dpr);
    const cx = size / 2;
    const cy = size / 2;
    // Основные частицы
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + Math.random() * 0.2;
      const speed = 2.5 + Math.random() * 2.5;
      const type = Math.random() < 0.5 ? 'dot' : (Math.random() < 0.7 ? 'line' : 'spark');
      const palette = COLORS[Math.floor(Math.random() * COLORS.length)];
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed * (0.8 + Math.random()*0.5),
        vy: Math.sin(angle) * speed * (0.8 + Math.random()*0.5),
        r: 2.5 + Math.random() * 3.5,
        len: 12 + Math.random() * 18,
        colorStops: palette,
        alpha: 1,
        t: 0,
        type,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random()-0.5)*0.2,
        flash: Math.random() < 0.18,
      };
    });
    // Dust-частицы
    const dust = Array.from({ length: DUST_COUNT }, () => {
      const angle = Math.PI/2 + (Math.random()-0.5)*0.7; // вниз с разбросом
      const speed = 1.2 + Math.random() * 1.2;
      return {
        x: cx + (Math.random()-0.5)*10,
        y: cy + (Math.random()-0.5)*10,
        vx: Math.cos(angle) * speed + (Math.random()-0.5)*0.5,
        vy: Math.sin(angle) * speed + Math.random()*0.7,
        r: 1.1 + Math.random() * 1.2,
        color: DUST_COLORS[Math.floor(Math.random()*DUST_COLORS.length)],
        alpha: 0.7 + Math.random()*0.3,
        t: 0,
      };
    });
    let frame = 0;
    function draw() {
      ctx!.clearRect(0, 0, size, size);
      // Основные частицы
      for (const p of particles) {
        ctx!.save();
        ctx!.globalAlpha = p.alpha;
        let grad;
        if (p.type === 'line' || p.type === 'spark') {
          grad = ctx!.createLinearGradient(p.x, p.y, p.x - p.vx * p.len, p.y - p.vy * p.len);
          grad.addColorStop(0, p.colorStops[0]);
          grad.addColorStop(0.3, p.colorStops[1]);
          grad.addColorStop(0.7, p.colorStops[2]);
          grad.addColorStop(1, p.colorStops[3]);
        }
        if (p.flash && p.t < 4) {
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r * (1.5 - p.t*0.1), 0, Math.PI * 2);
          ctx!.fillStyle = lerpColor(p.colorStops[0], p.colorStops[1], p.t/4);
          ctx!.shadowColor = p.colorStops[0];
          ctx!.shadowBlur = 24;
          ctx!.fill();
        }
        if (p.type === 'dot') {
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx!.fillStyle = p.colorStops[0];
          ctx!.shadowColor = p.colorStops[1];
          ctx!.shadowBlur = 10;
          ctx!.fill();
        } else if (p.type === 'line') {
          ctx!.save();
          ctx!.translate(p.x, p.y);
          ctx!.rotate(p.rot);
          ctx!.beginPath();
          ctx!.moveTo(0, 0);
          ctx!.lineTo(-p.vx * p.len, -p.vy * p.len);
          ctx!.strokeStyle = grad!;
          ctx!.lineWidth = 2.2 + Math.sin(p.t*0.3)*0.7;
          ctx!.shadowColor = p.colorStops[1];
          ctx!.shadowBlur = 12;
          ctx!.stroke();
          ctx!.restore();
        } else if (p.type === 'spark') {
          ctx!.save();
          ctx!.translate(p.x, p.y);
          ctx!.rotate(p.rot);
          ctx!.beginPath();
          ctx!.moveTo(0, 0);
          ctx!.lineTo(-p.vx * p.len * 0.7, -p.vy * p.len * 0.7);
          ctx!.strokeStyle = grad!;
          ctx!.lineWidth = 1.1;
          ctx!.shadowColor = p.colorStops[2];
          ctx!.shadowBlur = 8;
          ctx!.stroke();
          ctx!.restore();
        }
        ctx!.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.alpha *= 0.92;
        p.t += 1;
        p.rot += p.rotSpeed;
      }
      // Dust-частицы
      for (const d of dust) {
        ctx!.save();
        ctx!.globalAlpha = d.alpha;
        ctx!.beginPath();
        ctx!.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx!.fillStyle = d.color;
        ctx!.shadowColor = d.color;
        ctx!.shadowBlur = 6;
        ctx!.fill();
        ctx!.restore();
        d.x += d.vx;
        d.y += d.vy;
        d.vx *= 0.98;
        d.vy += 0.07 + Math.random()*0.03; // гравитация
        d.alpha *= 0.97;
        d.t += 1;
      }
      frame++;
      if (frame < 48) {
        requestAnimationFrame(draw);
      } else {
        onEnd && onEnd();
      }
    }
    draw();
    // eslint-disable-next-line
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        left: x - 70,
        top: y - 70,
        pointerEvents: 'none',
        zIndex: 10000,
        width: 140,
        height: 140,
      }}
    />
  );
} 