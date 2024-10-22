const OpenAI = require('openai');
const pdfParse = require('pdf-parse');

// Initialize OpenAI with the API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here', // Ensure the API key is set directly if needed
});

exports.analyzeReport = async (req, res) => {
  try {
    const file = req.file;
    const userInfo = JSON.parse(req.body.userInfo);

    // Logging req.file and req.body.userInfo for debugging purposes
    console.log(req.file); // Logs file information
    console.log(req.body.userInfo); // Logs userInfo

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract text from PDF only (remove image support for simplicity)
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Unsupported file type. Only PDF is allowed.' });
    }
    
    // Extract text from the uploaded PDF
    const extractedText = await extractTextFromPDF(file.buffer);

    // Parse health metrics from the extracted text
    const metrics = parseHealthMetrics(extractedText, userInfo);

    if (Object.keys(metrics).length === 0) {
      return res.status(400).json({
        error: 'No valid health metrics found in the report. Ensure the report contains standard health metrics.',
      });
    }

    // Generate the AI prompt using patient info and metrics
    const prompt = generatePrompt(userInfo, metrics);

    // Generate the AI summary
    const summary = await getAISummary(prompt);

    // Send the summary back as the response
    res.json({ summary });
  } catch (error) {
    console.error('Error processing report:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Extract text from a PDF buffer
const extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    if (!data.text) {
      throw new Error('No text found in PDF.');
    }
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    throw new Error('Failed to process PDF.');
  }
};

// Parse health metrics from the extracted text
const parseHealthMetrics = (text, userInfo) => {
  const metrics = {};
  const lines = text.split('\n');

  lines.forEach((line) => {
    const lowerLine = line.toLowerCase().trim();

    // Attempt to extract common health metrics
    if (lowerLine.includes('glucose')) {
      metrics.glucose = extractValue(line);
    }
    if (lowerLine.includes('cholesterol')) {
      metrics.cholesterol = extractValue(line);
    }
    if (lowerLine.includes('alt')) {
      metrics.alt = extractValue(line);
    }
    if (lowerLine.includes('ast')) {
      metrics.ast = extractValue(line);
    }
  });

  return metrics;
};

// Extract numerical value from a line of text
const extractValue = (line) => {
  const match = line.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[0]) : null;
};

// Generate a prompt for OpenAI based on user info and health metrics
const generatePrompt = (userInfo, metrics) => {
  let prompt = `
You are a medical expert providing a health summary for a patient based on their lab report. Please use a friendly and empathetic tone.

Patient Information:
Name: ${userInfo.name}
Age: ${userInfo.age}
Gender: ${userInfo.gender}

Lab Results:
`;

  for (const [key, value] of Object.entries(metrics)) {
    prompt += `${key}: ${value}\n`;
  }

  prompt += `
Provide practical advice with a positive tone.
  `;

  return prompt;
};

// Get a health summary from OpenAI
const getAISummary = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.5,
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error with AI API:', error.message);
    throw new Error('AI processing failed');
  }
};
