// frontend/src/components/LandingPage.jsx

import React, { useState } from 'react';
import FileUpload from './FileUpload';
import Summary from './Summary';

function LandingPage() {
  const [userInfo, setUserInfo] = useState({
    name: '',
    age: '',
    gender: '',
    conditions: '',
  });
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState(null);

  const handleInputChange = (e) => {
    setUserInfo({ ...userInfo, [e.target.name]: e.target.value });
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold text-center mb-6">
        Upload or Drag-and-Drop Your Blood Report
      </h1>
      <form className="mb-6 grid grid-cols-1 gap-4">
        <input
          type="text"
          name="name"
          placeholder="Name"
          value={userInfo.name}
          onChange={handleInputChange}
          className="p-2 border rounded"
        />
        <input
          type="number"
          name="age"
          placeholder="Age"
          value={userInfo.age}
          onChange={handleInputChange}
          className="p-2 border rounded"
        />
        <select
          name="gender"
          value={userInfo.gender}
          onChange={handleInputChange}
          className="p-2 border rounded"
        >
          <option value="">Select Gender</option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
          <option value="Other">Other</option>
        </select>
        <input
          type="text"
          name="conditions"
          placeholder="Known Medical Conditions"
          value={userInfo.conditions}
          onChange={handleInputChange}
          className="p-2 border rounded"
        />
      </form>
      <FileUpload
        file={file}
        setFile={setFile}
        userInfo={userInfo}
        setSummary={setSummary}
      />
      {summary && <Summary summary={summary} />}
    </div>
  );
}

export default LandingPage;
