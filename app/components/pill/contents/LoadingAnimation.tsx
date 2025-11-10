import React from 'react'

interface LoadingAnimationProps {
  color?: string
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  color = '#FFFFFF',
}) => {
  return (
    <>
      <style>{`
        @keyframes shadowRolling {
          0% {
            box-shadow: 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0);
          }
          12% {
            box-shadow: 100px 0 ${color}, 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0);
          }
          25% {
            box-shadow: 110px 0 ${color}, 100px 0 ${color}, 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0);
          }
          36% {
            box-shadow: 120px 0 ${color}, 110px 0 ${color}, 100px 0 ${color}, 0px 0 rgba(255, 255, 255, 0);
          }
          50% {
            box-shadow: 130px 0 ${color}, 120px 0 ${color}, 110px 0 ${color}, 100px 0 ${color};
          }
          62% {
            box-shadow: 200px 0 rgba(255, 255, 255, 0), 130px 0 ${color}, 120px 0 ${color}, 110px 0 ${color};
          }
          75% {
            box-shadow: 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 130px 0 ${color}, 120px 0 ${color};
          }
          87% {
            box-shadow: 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 130px 0 ${color};
          }
          100% {
            box-shadow: 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0);
          }
        }
      `}</style>
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          display: 'block',
          position: 'relative',
          color: color,
          left: '-100px',
          boxSizing: 'border-box',
          animation: 'shadowRolling 2s linear infinite',
        }}
      />
    </>
  )
}
