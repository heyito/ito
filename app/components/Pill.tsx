import React from 'react';

// THE CORRECTED FIX: Target #app, which is the actual ID of your root element.
const globalStyles = `
  html, body, #app {
    height: 100%;
    margin: 0;
    overflow: hidden;
  }
`;

const Pill = () => {
  const pillStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.7)',
    backdropFilter: 'blur(12px)',
    width: '100%',
    height: '100%', // This will now inherit the correct height
    borderRadius: '21px', // Half of the desired 42px height
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxSizing: 'border-box',
  };

  return (
    <>
      <style>{globalStyles}</style>
      <div style={pillStyle}>
        {/* The correctly styled pill will now appear. */}
      </div>
    </>
  );
};

export default Pill;