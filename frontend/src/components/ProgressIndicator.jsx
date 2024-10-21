// frontend/src/components/ProgressIndicator.jsx

import React from 'react';

function ProgressIndicator() {
  return (
    <div className="mt-4 flex justify-center items-center">
      <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-8 w-8"></div>
      <span className="ml-2 text-gray-700">Processing...</span>
    </div>
  );
}

export default ProgressIndicator;
