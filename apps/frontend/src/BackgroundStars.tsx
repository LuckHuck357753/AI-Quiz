import React, { useEffect, useRef } from 'react';

const STAR_LAYERS = [
  { count: 60, size: 1.2, speed: 0.1, color: 'rgba(255,255,255,0.8)' },
  { count: 40, size: 2.2, speed: 0.2, color: 'rgba(180,200,255,0.7)' },
  { count: 20, size: 3.2, speed: 0.35, color: 'rgba(255,255,200,0.5)' },
];
const METEOR_INTERVAL = 3500;

function randomStar(w: number, h: number, layer: any) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    size: layer.size * (0.7 + Math.random() * 0.6),
    baseSize: layer.size * (0.7 + Math.random() * 0.6),
    twinkle: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.008 + Math.random() * 0.012,
    breathPhase: Math.random() * Math.PI * 2,
    breathSpeed: 0.003 + Math.random() * 0.004,
    color: layer.color,
    speed: layer.speed * (0.7 + Math.random() * 0.6),
  };
}

// Добавляю тип и ref для пыли
const DUST_COUNT = 40;

export default function BackgroundStars() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<any[][]>([]);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const mouse = useRef<{x:number, y:number, vx:number, vy:number, lastMove:number}>({x:0, y:0, vx:0, vy:0, lastMove:0});
  const dustRef = useRef<Array<{x:number, y:number, r:number, a:number, vx:number, vy:number, life:number}>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    // Инициализация звёзд
    starsRef.current = STAR_LAYERS.map(layer =>
      Array.from({ length: layer.count }, () => randomStar(w, h, layer))
    );

    // Инициализация пыли
    function spawnDust() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.7 + Math.random() * 1.2,
        a: 0.08 + Math.random() * 0.12,
        vx: -0.03 + Math.random() * 0.06,
        vy: -0.03 + Math.random() * 0.06,
        life: 400 + Math.random() * 400
      };
    }
    dustRef.current = Array.from({length: DUST_COUNT}, spawnDust);

    // Параллакс-эффект
    const onMove = (e: MouseEvent | TouchEvent) => {
      let x = 0.5, y = 0.5;
      if ('touches' in e && e.touches.length) {
        x = e.touches[0].clientX / w;
        y = e.touches[0].clientY / h;
      } else if ('clientX' in e) {
        x = e.clientX / w;
        y = e.clientY / h;
      }
      mouseRef.current = { x, y };
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);

    // Анимация
    let frame = 0;
    function draw() {
      ctx!.clearRect(0, 0, w, h);
      // Пыль
      for (const d of dustRef.current) {
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(d.x, d.y, d.r, 0, Math.PI*2);
        ctx!.fillStyle = '#fff';
        ctx!.globalAlpha = d.a;
        ctx!.shadowColor = '#fff';
        ctx!.shadowBlur = 6;
        ctx!.fill();
        ctx!.restore();
        // Движение и жизнь
        d.x += d.vx;
        d.y += d.vy;
        d.life--;
        // Лёгкое случайное изменение направления
        if (Math.random() < 0.01) {
          d.vx += (-0.01 + Math.random()*0.02);
          d.vy += (-0.01 + Math.random()*0.02);
        }
        // Плавное затухание на краях экрана
        if (d.x < 0 || d.x > w || d.y < 0 || d.y > h || d.life < 0) {
          Object.assign(d, spawnDust());
        }
      }
      // Оставляю только отрисовку звёзд с реакцией на мышь
      for (const layer of starsRef.current) {
        for (const s of layer) {
          // Глубокое мерцание и дыхание
          const breath = 0.85 + 0.18 * Math.sin(frame * s.breathSpeed + s.breathPhase);
          const tw = 0.7 + 0.5 * Math.sin(frame * s.twinkleSpeed + s.twinkle);
          const starSize = s.baseSize * breath * tw;
          let dx = s.x - mouse.current.x;
          let dy = s.y - mouse.current.y;
          let dist = Math.sqrt(dx*dx + dy*dy);
          let maxDist = 200;
          let force = dist < maxDist ? (1 - dist/maxDist) : 0;
          let mx = 0, my = 0;
          if (force > 0) {
            let fx = dx/dist;
            let fy = dy/dist;
            mx = fx * mouse.current.vx * force * 1.5;
            my = fy * mouse.current.vy * force * 1.5;
          }
          if (Date.now() - mouse.current.lastMove > 200) {
            mouse.current.vx *= 0.95;
            mouse.current.vy *= 0.95;
          }
          ctx!.save();
          ctx!.beginPath();
          ctx!.arc(s.x + mx, s.y + my, starSize, 0, Math.PI*2);
          ctx!.fillStyle = s.color;
          ctx!.globalAlpha = 0.6 + 0.35 * tw * breath;
          ctx!.shadowColor = s.color;
          ctx!.shadowBlur = starSize * 4;
          ctx!.fill();
          ctx!.restore();
        }
      }
      frame++;
      requestAnimationFrame(draw);
    }
    draw();

    // Resize
    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      starsRef.current = STAR_LAYERS.map(layer =>
        Array.from({ length: layer.count }, () => randomStar(w, h, layer))
      );
      dustRef.current = Array.from({length: DUST_COUNT}, spawnDust);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
} 