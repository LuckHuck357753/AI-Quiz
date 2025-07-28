import React, { useEffect, useState } from 'react';

// 🚀 Yandex Team Rocket Animation Component - Force Railway Deployment

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
      }, 3000); // 3 секунды на анимацию

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
      className={`fixed top-4 right-4 z-50 pointer-events-none transition-all duration-500 ${
        isAnimating ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-24'
      }`}
      style={{
        width: '120px',
        height: '60px',
        transition: isAnimating 
          ? 'transform 3s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.5s ease-in' 
          : 'transform 0.5s ease-out, opacity 0.5s ease-out'
      }}
    >
      {/* Ракета */}
      <div className="relative w-full h-full">
        {/* Основной корпус ракеты */}
        <div 
          className="absolute w-16 h-8 rounded-full"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
            background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)'
          }}
        >
          {/* Нос ракеты */}
          <div 
            className="absolute w-0 h-0"
            style={{
              left: '-8px',
              top: '50%',
              transform: 'translateY(-50%)',
              borderLeft: '8px solid #f87171',
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent'
            }}
          />
          
          {/* Кабина пилота */}
          <div 
            className="absolute w-3 h-3 bg-blue-400 rounded-full opacity-80"
            style={{
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              boxShadow: '0 0 10px rgba(96, 165, 250, 0.8)'
            }}
          />
          
          {/* Светящаяся линия */}
          <div 
            className={`absolute w-1 h-6 bg-cyan-400 rounded-full ${
              isAnimating ? 'animate-pulse' : ''
            }`}
            style={{
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              boxShadow: '0 0 15px rgba(34, 211, 238, 0.8)',
              animation: isAnimating ? 'pulse 0.5s infinite' : 'none'
            }}
          />
          
          {/* Хвостовые стабилизаторы */}
          <div 
            className="absolute w-2 h-4 bg-red-700 rounded-sm"
            style={{
              right: '-2px',
              top: '2px',
              transform: 'rotate(-15deg)'
            }}
          />
          <div 
            className="absolute w-2 h-4 bg-red-700 rounded-sm"
            style={{
              right: '-2px',
              bottom: '2px',
              transform: 'rotate(15deg)'
            }}
          />
        </div>
        
        {/* Текст Yandex Team */}
        <div 
          className="absolute text-white text-xs font-bold whitespace-nowrap"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            textShadow: '0 0 5px rgba(0,0,0,0.8)',
            fontSize: '8px',
            letterSpacing: '0.5px'
          }}
        >
          Yandex Team
        </div>
        
        {/* Эффект движения - белые полосы */}
        {isAnimating && (
          <>
            <div 
              className="absolute w-8 h-1 bg-white opacity-30 rounded-full"
              style={{
                left: '-8px',
                top: '30%',
                transform: 'translateY(-50%)',
                animation: 'rocketTrail 0.3s infinite'
              }}
            />
            <div 
              className="absolute w-6 h-1 bg-white opacity-20 rounded-full"
              style={{
                left: '-6px',
                top: '70%',
                transform: 'translateY(-50%)',
                animation: 'rocketTrail 0.4s infinite'
              }}
            />
          </>
        )}
      </div>
      
      {/* CSS анимации через style тег */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          
          @keyframes rocketTrail {
            0% { 
              transform: translateY(-50%) scaleX(1);
              opacity: 0.3;
            }
            50% { 
              transform: translateY(-50%) scaleX(1.2);
              opacity: 0.1;
            }
            100% { 
              transform: translateY(-50%) scaleX(1);
              opacity: 0.3;
            }
          }
        `
      }} />
    </div>
  );
};

export default YandexRocket; 