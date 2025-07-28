import React, { useEffect, useState } from 'react';

// 🚀 Yandex Team Rocket Animation Component - Exact copy from user's GIF

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
      }, 4000); // 4 секунды на анимацию (как в оригинальном GIF)

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
      {/* Ракета - точная копия из GIF */}
      <div className="relative w-full h-full">
        {/* Основной корпус ракеты - глянцевый красный металл */}
        <div 
          className="absolute w-20 h-10 rounded-full"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 25%, #f87171 50%, #ef4444 75%, #dc2626 100%)',
            boxShadow: `
              0 0 25px rgba(239, 68, 68, 0.8),
              inset 0 0 20px rgba(255, 255, 255, 0.1),
              0 0 40px rgba(239, 68, 68, 0.4)
            `,
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          {/* Нос ракеты - заостренный */}
          <div 
            className="absolute w-0 h-0"
            style={{
              left: '-12px',
              top: '50%',
              transform: 'translateY(-50%)',
              borderLeft: '12px solid #f87171',
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              filter: 'drop-shadow(0 0 10px rgba(248, 113, 113, 0.8))'
            }}
          />
          
          {/* Кабина пилота - синяя светящаяся */}
          <div 
            className="absolute w-4 h-4 rounded-full"
            style={{
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'radial-gradient(circle, #60a5fa 0%, #3b82f6 50%, #1d4ed8 100%)',
              boxShadow: `
                0 0 15px rgba(96, 165, 250, 0.9),
                inset 0 0 8px rgba(255, 255, 255, 0.3),
                0 0 25px rgba(96, 165, 250, 0.6)
              `,
              border: '1px solid rgba(255, 255, 255, 0.4)'
            }}
          />
          
          {/* Светящаяся пунктирная линия - бирюзовая пульсирующая */}
          <div 
            className={`absolute w-1 h-8 rounded-full ${
              isAnimating ? 'animate-pulse' : ''
            }`}
            style={{
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'linear-gradient(to bottom, #06b6d4 0%, #22d3ee 50%, #67e8f9 100%)',
              boxShadow: `
                0 0 20px rgba(6, 182, 212, 0.9),
                0 0 40px rgba(34, 211, 238, 0.6),
                0 0 60px rgba(103, 232, 249, 0.3)
              `,
              animation: isAnimating ? 'pulse 0.6s infinite, glow 1.2s infinite' : 'none'
            }}
          />
          
          {/* Хвостовые стабилизаторы - красные металлические */}
          <div 
            className="absolute w-3 h-6 rounded-sm"
            style={{
              right: '-3px',
              top: '1px',
              transform: 'rotate(-20deg)',
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              boxShadow: '0 0 10px rgba(220, 38, 38, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          />
          <div 
            className="absolute w-3 h-6 rounded-sm"
            style={{
              right: '-3px',
              bottom: '1px',
              transform: 'rotate(20deg)',
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              boxShadow: '0 0 10px rgba(220, 38, 38, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          />
        </div>
        
        {/* Текст Yandex Team - белый с тенью */}
        <div 
          className="absolute text-white font-bold whitespace-nowrap"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            textShadow: '0 0 8px rgba(0,0,0,0.9), 0 0 15px rgba(0,0,0,0.7)',
            fontSize: '9px',
            letterSpacing: '0.8px',
            fontWeight: '700',
            color: '#ffffff'
          }}
        >
          Yandex Team
        </div>
        
        {/* Эффект движения - белые полупрозрачные полосы от носа */}
        {isAnimating && (
          <>
            <div 
              className="absolute w-12 h-1 bg-white rounded-full"
              style={{
                left: '-12px',
                top: '35%',
                transform: 'translateY(-50%)',
                opacity: 0.4,
                animation: 'rocketTrail 0.4s infinite'
              }}
            />
            <div 
              className="absolute w-10 h-1 bg-white rounded-full"
              style={{
                left: '-10px',
                top: '65%',
                transform: 'translateY(-50%)',
                opacity: 0.3,
                animation: 'rocketTrail 0.5s infinite'
              }}
            />
            <div 
              className="absolute w-8 h-1 bg-white rounded-full"
              style={{
                left: '-8px',
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0.5,
                animation: 'rocketTrail 0.3s infinite'
              }}
            />
          </>
        )}
      </div>
      
      {/* CSS анимации */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0%, 100% { 
              opacity: 1; 
              transform: translateY(-50%) scale(1);
            }
            50% { 
              opacity: 0.7; 
              transform: translateY(-50%) scale(1.1);
            }
          }
          
          @keyframes glow {
            0%, 100% { 
              box-shadow: 
                0 0 20px rgba(6, 182, 212, 0.9),
                0 0 40px rgba(34, 211, 238, 0.6),
                0 0 60px rgba(103, 232, 249, 0.3);
            }
            50% { 
              box-shadow: 
                0 0 30px rgba(6, 182, 212, 1),
                0 0 60px rgba(34, 211, 238, 0.8),
                0 0 90px rgba(103, 232, 249, 0.5);
            }
          }
          
          @keyframes rocketTrail {
            0% { 
              transform: translateY(-50%) scaleX(1);
              opacity: 0.5;
            }
            50% { 
              transform: translateY(-50%) scaleX(1.3);
              opacity: 0.2;
            }
            100% { 
              transform: translateY(-50%) scaleX(1);
              opacity: 0.5;
            }
          }
        `
      }} />
    </div>
  );
};

export default YandexRocket; 