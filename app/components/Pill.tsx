import React from 'react';

const globalStyles = `
  html, body, #app {
    height: 100%;
    margin: 0;
  }
`;

const Pill = () => {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  };

  // This is your original pill style, it does not need to change
  const pillStyle: React.CSSProperties = {
    backgroundColor: '#808080',
    width: '48px',
    height: '8px',
    borderRadius: '21px',
    border: '1px solid #A9A9A9',
    boxSizing: 'border-box',
    backgroundClip: 'padding-box',
  };

  return (
    <>
      <style>{globalStyles}</style>
      <div style={containerStyle}>
        <div style={pillStyle}>
        </div>
      </div>
    </>
  );
};

export default Pill;