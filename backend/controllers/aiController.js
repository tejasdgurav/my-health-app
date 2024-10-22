const OpenAI = require('openai');
const pdfParse = require('pdf-parse');

// Initialize OpenAI with the API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
});

exports.analyzeReport = async (req, res) => {
  try {
    const file = req.file;

    // Check if file is uploaded
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if the file is a valid PDF
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Unsupported file type. Only PDF is allowed.' });
    }

    // Extract text from the uploaded PDF
    const extractedText = await extractTextFromPDF(file.buffer);
    if (!extractedText) {
      return res.status(400).json({ error: 'No text found in the PDF.' });
    }


    // Generate the AI prompt using metrics
    const prompt = generatePrompt(metrics);

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
    return data.text || ''; // Return empty string if no text found
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    return ''; // Return empty string on error to avoid crashing
  }
};

// Parse health metrics from the extracted text
const parseHealthMetrics = (text) => {
  const metrics = {};
  const lines = text.split('\n');

  lines.forEach((line) => {
    const lowerLine = line.toLowerCase().trim();

    // Check for common health metrics; use flexible matching
    if (lowerLine.includes('glucose')) {
      metrics.glucose = extractValue(line);
    }
    if (lowerLine.includes('cholesterol')) {
      metrics.cholesterol = extractValue(line);
    }
    // Add more metrics as needed, but keep it simple
  });

  return Object.keys(metrics).length > 0 ? metrics : null; // Return null if no metrics found
};

// Extract numerical value from a line of text
const extractValue = (line) => {
  const match = line.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[0]) : null; // Return number or null
};

// Generate a prompt for OpenAI based on health metrics
const generatePrompt = (metrics) => {
  let prompt = `
You are a medical expert providing a health summary based on the following lab results:

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
