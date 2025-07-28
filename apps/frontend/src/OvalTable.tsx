import React, { useState, useRef } from 'react';

export type OvalTablePlayer = {
  id: string;
  name: string;
  avatar: string;
  answered?: boolean;
};

export type OvalTableProps = {
  players: OvalTablePlayer[];
  onAvatarClick?: (player: OvalTablePlayer) => void;
  onInteraction?: (player: OvalTablePlayer, type: string) => void;
  width?: number;
  height?: number;
  myId?: string;
};

const INTERACTIONS = [
  { type: 'flowers', label: 'Цветы', emoji: '💐' },
  { type: 'tomato', label: 'Помидор', emoji: '🍅' },
  { type: 'respect', label: 'Респект', emoji: '🤝' },
  { type: 'cocktail', label: 'Коктейль', emoji: '🍸' },
  { type: 'tease', label: 'Подразнил', emoji: '😜' },
];

export default function OvalTable({ players, onAvatarClick, onInteraction, width = 340, height = 200, myId }: OvalTableProps) {
  const centerX = width / 2;
  const centerY = height / 2;
  const rx = width / 2 - 40;
  const ry = height / 2 - 40;
  const angleStep = (2 * Math.PI) / players.length;
  const [menuIdx, setMenuIdx] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Закрытие меню при клике вне
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuIdx !== null && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuIdx(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuIdx]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="relative" style={{ width, height }}>
        {/* Овал */}
        <svg width={width} height={height} className="absolute left-0 top-0 pointer-events-none">
          <ellipse cx={centerX} cy={centerY} rx={rx} ry={ry} fill="#23253a" opacity={0.7} />
        </svg>
        {/* Аватары по овалу */}
        {players.map((p, i) => {
          const angle = -Math.PI / 2 + i * angleStep;
          const x = centerX + rx * Math.cos(angle) - 32;
          const y = centerY + ry * Math.sin(angle) - 32;
          return (
            <div
              key={p.id}
              className="absolute flex flex-col items-center group cursor-pointer"
              style={{ left: x, top: y, width: 64, height: 80, zIndex: menuIdx === i ? 20 : 1 }}
              onClick={() => {
                if (p.id === myId) return; // Запретить взаимодействие с собой
                setMenuIdx(menuIdx === i ? null : i);
              }}
            >
              <img src={p.avatar} alt={p.name} className={`w-14 h-14 rounded-full object-cover border-2 ${p.answered ? 'border-green-400' : 'border-blue-400'} group-hover:scale-110 transition`} />
              <span className="text-xs mt-1 font-semibold truncate max-w-[60px] text-center">{p.name}</span>
              <span className={`text-xs ${p.answered ? 'text-green-400' : 'text-yellow-300'}`}>{p.answered ? '✔️' : '...'}</span>
              {/* Меню взаимодействий */}
              {menuIdx === i && (
                <div ref={menuRef} className="absolute left-1/2 top-full -translate-x-1/2 mt-2 bg-gray-800 border border-gray-700 rounded shadow-lg p-2 flex flex-col z-30 min-w-[120px]">
                  {INTERACTIONS.map(int => (
                    <button
                      key={int.type}
                      className="flex items-center gap-2 px-2 py-1 hover:bg-gray-700 rounded text-sm text-left"
                      onClick={e => {
                        e.stopPropagation();
                        setMenuIdx(null);
                        onInteraction && onInteraction(p, int.type);
                      }}
                    >{int.emoji} {int.label}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* Логотип Yandex Team в центре */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none flex items-center justify-center" style={{ width: 180 }}>
          <div className="flex items-center gap-2 bg-gray-800 bg-opacity-80 rounded-lg px-4 py-2">
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">Я</span>
            </div>
            <span className="text-white font-semibold text-lg" style={{ fontFamily: 'cursive' }}>team</span>
          </div>
        </div>
      </div>
    </div>
  );
} 