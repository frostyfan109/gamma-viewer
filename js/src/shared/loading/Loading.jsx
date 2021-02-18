import React from 'react';

import './loading.css';

const Loading = (props) => {
  const { message, positionStatic } = props;

  return (
    <div className={positionStatic ? 'loader-static' : ''}>
      <div className="bubbleContainer">
        <div className="bubble" />
        <div className="bubble" />
        <div className="bubble" />
        <div className="bubble" />
      </div>
      {message && (
        <h3 className="loadingMessage">{message}</h3>
      )}
    </div>
  );
};

export default Loading;
