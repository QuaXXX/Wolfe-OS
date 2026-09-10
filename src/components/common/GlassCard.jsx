import React from 'react';

export const GlassCard = ({
  children,
  className = '',
  hoverEffect = true,
  onClick,
  ...props
}) => {
  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-2xl theme-card overflow-hidden transition-transform duration-200
        ${hoverEffect ? 'cursor-pointer hover:-translate-y-0.5 sm:hover:-translate-y-1' : ''}
        ${className}
      `}
      {...props}
    >
      {/* Subtle top edge highlight */}
      <div 
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" 
      />
      {children}
    </div>
  );
};
