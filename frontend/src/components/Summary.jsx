// frontend/src/components/Summary.jsx

import React from 'react';
import jsPDF from 'jspdf';

function Summary({ summary }) {
  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(summary, 180);
    doc.text(lines, 10, 10);
    doc.save('health-summary.pdf');
  };

  return (
    <div className="mt-6">
      <h2 className="text-xl font-bold mb-4">Your Health Summary</h2>
      <div className="bg-gray-100 p-4 rounded whitespace-pre-wrap">
        {summary}
      </div>
      <button
        onClick={generatePDF}
        className="mt-4 bg-green-500 text-white px-4 py-2 rounded"
      >
        Download Summary as PDF
      </button>
    </div>
  );
}

export default Summary;
