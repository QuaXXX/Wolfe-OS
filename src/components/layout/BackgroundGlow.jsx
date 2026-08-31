import React from 'react';

export const BackgroundGlow = ({ hue = 255 }) => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 select-none bg-[#06070d]">
      {/* Dark Royal Blue-Purple Ambient Halo (Center/Top) */}
      <div 
        className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[65vw] h-[65vw] max-w-[850px] max-h-[850px] rounded-full opacity-25 blur-[160px] transition-all duration-300"
        style={{ 
          background: `radial-gradient(circle, hsla(${hue}, 80%, 45%, 0.4) 0%, hsla(${hue + 30}, 85%, 25%, 0.15) 50%, transparent 80%)` 
        }}
      />
      
      {/* Deep Midnight Blue/Purple Ambient Fill (Bottom) */}
      <div 
        className="absolute bottom-[-10%] right-[10%] w-[45vw] h-[45vw] max-w-[600px] max-h-[600px] rounded-full opacity-15 blur-[160px] transition-all duration-300"
        style={{ 
          background: `radial-gradient(circle, hsla(${hue - 35}, 85%, 35%, 0.3) 0%, transparent 70%)` 
        }}
      />

      {/* Subtle Fine Technical Grid */}
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
          backgroundSize: '36px 36px'
        }}
      />

      {/* Deep Vignette */}
      <div className="absolute inset-0 bg-[#06070d]/50" />
    </div>
  );
};
