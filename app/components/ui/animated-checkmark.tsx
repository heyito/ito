import { useState, useEffect, useRef } from 'react';
import { Check } from "@mynaui/icons-react";

// AnimatedCheck component for check mark animation
function AnimatedCheck({ trigger }: { trigger: boolean }) {
  const [showWidth, setShowWidth] = useState(false);
  const [showOpacity, setShowOpacity] = useState(false);
  const checkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trigger) {
      setShowWidth(false);
      setShowOpacity(false);
      // Start width animation
      setTimeout(() => {
        setShowWidth(true);
        // After width animation, start opacity
        setTimeout(() => {
          setShowOpacity(true);
        }, 350); // match transition duration
      }, 50);
    } else {
      setShowWidth(false);
      setShowOpacity(false);
    }
  }, [trigger]);

  return (
    <div
      ref={checkRef}
      style={{
        overflow: 'hidden',
        display: 'inline-block',
        width: showWidth ? 24 : 0,
        transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)',
        verticalAlign: 'middle',
      }}
    >
      <Check
        className="mr-1"
        style={{
          color: '#22c55e',
          width: 24,
          height: 24,
          opacity: showOpacity ? 1 : 0,
          transition: 'opacity 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
    </div>
  );
}

export { AnimatedCheck };