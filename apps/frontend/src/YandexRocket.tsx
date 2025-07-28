import React, { useEffect, useState } from 'react';

// 🚀 Yandex Team Rocket - User's original GIF

interface YandexRocketProps {
  isVisible?: boolean;
  onAnimationComplete?: () => void;
}

const YandexRocket: React.FC<YandexRocketProps> = ({ 
  isVisible = true, 
  onAnimationComplete 
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    console.log('[YandexRocket] useEffect triggered:', { isVisible, isAnimating });
    if (isVisible && !isAnimating) {
      console.log('[YandexRocket] Starting animation');
      setIsAnimating(true);
      
      // Запускаем анимацию через небольшую задержку
      const timer = setTimeout(() => {
        console.log('[YandexRocket] Animation completed');
        setIsAnimating(false);
        onAnimationComplete?.();
      }, 4000); // 4 секунды на анимацию

      return () => clearTimeout(timer);
    }
  }, [isVisible, isAnimating, onAnimationComplete]);

  console.log('[YandexRocket] Rendering component:', { isVisible, isAnimating });
  if (!isVisible) {
    console.log('[YandexRocket] Component not visible, returning null');
    return null;
  }

  return (
    <div 
      className={`fixed top-4 right-4 z-50 pointer-events-none transition-all duration-1000 ${
        isAnimating ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-32'
      }`}
      style={{
        width: '140px',
        height: '80px',
        transition: isAnimating 
          ? 'transform 4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.8s ease-in' 
          : 'transform 0.5s ease-out, opacity 0.5s ease-out'
      }}
    >
      {/* Контейнер с фоном игры для маскировки прозрачности */}
      <div 
        className="w-full h-full relative overflow-hidden rounded-lg"
        style={{
          background: 'linear-gradient(135deg, #1f2937 0%, #111827 50%, #0f172a 100%)',
          boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Оригинальный GIF с ракетой Yandex Team */}
        <img 
          src="/assets/yandex-rocket.gif"
          alt="Yandex Team Rocket"
          className="w-full h-full object-contain"
          style={{
            filter: 'drop-shadow(0 0 20px rgba(239, 68, 68, 0.6))',
            mixBlendMode: 'normal'
          }}
        />
      </div>
      
      {/* CSS для полного удаления прозрачности */}
      <style dangerouslySetInnerHTML={{
        __html: `
          /* Убираем все прозрачные области */
          img[src="/assets/yandex-rocket.gif"] {
            background: transparent !important;
            mix-blend-mode: normal !important;
            isolation: isolate;
            image-rendering: pixelated;
          }
          
          /* Принудительно убираем прозрачность */
          img[src="/assets/yandex-rocket.gif"] {
            background-color: transparent !important;
            background-image: none !important;
            -webkit-background-clip: unset !important;
            background-clip: unset !important;
          }
          
          /* Альтернативный способ - замена прозрачности на цвет фона */
          @supports (mix-blend-mode: multiply) {
            img[src="/assets/yandex-rocket.gif"] {
              mix-blend-mode: multiply;
              background-color: #111827 !important;
            }
          }
        `
      }} />
    </div>
  );
};

export default YandexRocket; 