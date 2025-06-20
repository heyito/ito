import React, { useState, useEffect } from 'react';

const globalStyles = `
  html, body, #app {
    height: 100%;
    margin: 0;
    overflow: hidden; /* Prevent scrollbars */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;

    /* These styles are key to anchoring the pill to the bottom center */
    /* of its transparent window, allowing it to expand upwards. */
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
`;

// A new component to very basic audio visualization
const AudioBars = ({ volume }: { volume: number }) => {
  // Base heights for visual variety
  const bars = [0.4, 0.7, 1, 0.8, 0.5, 0.6, 0.3];

  const barStyle = (baseHeight: number): React.CSSProperties => {
    // Amplify volume for a more noticeable effect and clamp the value
    const scale = Math.max(0.05, Math.min(1, volume * 4));
    
    return {
      width: '5px',
      backgroundColor: 'white',
      borderRadius: '2.5px',
      margin: '0 2.5px',
      height: `${baseHeight * 20 * scale}px`, // Max height is 20px
      transition: 'height 0.08s ease-out',
    };
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
      {bars.map((h, i) => (
        <div key={i} style={barStyle(h)} />
      ))}
    </div>
  );
};

const Pill = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    // Listen for recording state changes from the main process
    const unsubRecording = window.api.on(
      'recording-state-update',
      (state: { isRecording: boolean }) => {
        // No longer need to ask main to resize. Just update React state.
        setIsRecording(state.isRecording);
      }
    );

    // Listen for volume updates from the main process
    const unsubVolume = window.api.on('volume-update', (vol: number) => {
        setVolume(vol);
    });

    // Cleanup listeners when the component unmounts
    return () => {
      unsubRecording();
      unsubVolume();
    };
  }, []); // Dependency array is empty as the logic inside doesn't depend on state.

  // Define dimensions for both states
  const idleWidth = 60;
  const idleHeight = 8;
  const recordingWidth = 120;
  const recordingHeight = 40;
  
  // A single, unified style for the pill. Its properties will be
  // smoothly transitioned by CSS.
  const pillStyle: React.CSSProperties = {
    // Flex properties to center the audio bars inside
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    
    // Dynamic styles that change based on the recording state
    width: isRecording ? `${recordingWidth}px` : `${idleWidth}px`,
    height: isRecording ? `${recordingHeight}px` : `${idleHeight}px`,
    backgroundColor: isRecording ? '#000000' : '#808080',
    border: '1px solid #A9A9A9',
    
    // Static styles
    borderRadius: '21px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    
    // The transition property makes the magic happen!
    // We animate width, height, and color changes over 0.3 seconds.
    transition: 'width 0.3s ease, height 0.3s ease, background-color 0.3s ease',
  };

  return (
    <>
      <style>{globalStyles}</style>
      <div style={pillStyle}>
        {/* Conditionally render the audio bars. They will fade in as the
            pill expands because they are part of the content. */}
        {isRecording && <AudioBars volume={volume} />}
      </div>
    </>
  );
};

export default Pill;