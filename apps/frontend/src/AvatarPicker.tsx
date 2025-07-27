import React, { useRef } from 'react';

const DEFAULT_AVATARS = [
  '/avatars/avatar1.png',
  '/avatars/avatar2.png',
  '/avatars/avatar3.png',
  '/avatars/avatar4.png',
  '/avatars/avatar5.png',
  '/avatars/avatar6.png',
  '/avatars/avatar7.png', // сова
  '/avatars/avatar8.png', // лошадь
  '/avatars/avatar9.png', // медуза
  '/avatars/avatar10.png', // панда
  '/avatars/avatar11.png', // черепаха
  '/avatars/avatar12.png', // попугай
  '/avatars/avatar13.png', // голубь
  '/avatars/avatar14.png', // ленивец
  '/avatars/avatar15.png', // жёлтый призрак
  '/avatars/avatar16.png', // креветка
  '/avatars/avatar17.png', // слон
  '/avatars/avatar18.png', // краб
];

export type AvatarPickerProps = {
  value: string;
  onChange: (avatar: string) => void;
};

export default function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        onChange(ev.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-sm text-gray-300 mb-1">Выберите аватар</div>
      <div className="flex gap-2 flex-wrap justify-center mb-2">
        {DEFAULT_AVATARS.map((src) => (
          <button
            key={src}
            className={`rounded-full border-2 ${value === src ? 'border-blue-400' : 'border-transparent'} focus:outline-none`}
            style={{ padding: 0, background: 'none' }}
            onClick={() => onChange(src)}
            type="button"
          >
            <img src={src} alt="Аватар" className="w-14 h-14 rounded-full object-cover" />
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1">
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-white text-sm"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Загрузить свой аватар
        </button>
      </div>
      {value && (
        <div className="mt-2 flex flex-col items-center">
          <img src={value} alt="Выбранный аватар" className="w-16 h-16 rounded-full object-cover border-2 border-blue-400" />
        </div>
      )}
    </div>
  );
} 