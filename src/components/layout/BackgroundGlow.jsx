import React from 'react';

export const BackgroundGlow = ({ hue = 255 }) => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 select-none bg-[#06070d]">
      {/* Clean Subtle Ambient Aura (Center/Top) */}
      <div 
        className="absolute top-[2%] left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] rounded-full opacity-20 blur-[180px] transition-all duration-500"
        style={{ 
          background: `radial-gradient(circle, hsla(${hue}, 70%, 48%, 0.25) 0%, transparent 65%)` 
        }}
      />
      
      {/* Subtle Bottom Ambient Depth */}
      <div 
        className="absolute bottom-[-10%] right-[15%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] rounded-full opacity-10 blur-[180px] transition-all duration-500"
        style={{ 
          background: `radial-gradient(circle, hsla(${hue}, 60%, 40%, 0.18) 0%, transparent 65%)` 
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
