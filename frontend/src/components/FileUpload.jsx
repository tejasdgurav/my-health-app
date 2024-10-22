// frontend/src/components/FileUpload.jsx

import React, { useRef, useState } from 'react';
import axios from 'axios';
import ProgressIndicator from './ProgressIndicator';

function FileUpload({ file, setFile, userInfo, setSummary }) {
  const fileInputRef = useRef();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
      processFile(selectedFile);
    }
  };

  const validateFile = (file) => {
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (!validTypes.includes(file.type)) {
      alert('Unsupported file type.');
      return false;
    }
    if (file.size > maxSize) {
      alert('File size exceeds 10MB.');
      return false;
    }
    return true;
  };

  const processFile = async (file) => {
    if (!userInfo.name || !userInfo.age || !userInfo.gender) {
      alert('Please fill in all required fields.');
      return;
    }

    setIsProcessing(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userInfo', JSON.stringify(userInfo));

    try {
      const response = await axios.post('/api/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setSummary(response.data.summary);
    } catch (error) {
    // Detailed error handling
      if (error.response) {
        console.error('Error data:', error.response.data); // Log response data
        console.error('Error status:', error.response.status); // Log status code (e.g., 400, 500)
        console.error('Error headers:', error.response.headers); // Log headers
      } else {
        console.error('Error message:', error.message); // Log general error message
      }
      alert('An error occurred while processing your file.');
    } finally {
      setIsProcessing(false);
    }
  };


  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (validateFile(droppedFile)) {
      setFile(droppedFile);
      processFile(droppedFile);
    }
  };

  return (
    <div
      className="border-dashed border-4 border-gray-300 p-6 text-center"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,image/jpeg,image/png"
      />
      <button
        onClick={() => fileInputRef.current.click()}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Choose File
      </button>
      <p className="mt-4 text-gray-600">Or drag and drop your file here</p>
      {isProcessing && <ProgressIndicator />}
    </div>
  );
}

export default FileUpload;
