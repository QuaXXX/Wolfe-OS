import React from 'react';

export const WolfLogo = ({ className = "w-4 h-4", strokeWidth = 1.75 }) => {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Sleek Minimalist Geometric Wolf Head */}
      {/* Left Ear */}
      <path 
        d="M4 4L7.5 10.5L3 13.5L4 4Z" 
        stroke="currentColor" 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {/* Right Ear */}
      <path 
        d="M20 4L16.5 10.5L21 13.5L20 4Z" 
        stroke="currentColor" 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {/* Crown / Forehead */}
      <path 
        d="M7.5 10.5L12 7L16.5 10.5" 
        stroke="currentColor" 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {/* Snout to Nose */}
      <path 
        d="M8.5 13.5L12 20L15.5 13.5L12 11.5L8.5 13.5Z" 
        stroke="currentColor" 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {/* Cheek lines */}
      <path 
        d="M3 13.5L8.5 13.5" 
        stroke="currentColor" 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
      />
      <path 
        d="M21 13.5L15.5 13.5" 
        stroke="currentColor" 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
      />
    </svg>
  );
};
