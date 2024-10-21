// backend/controllers/aiController.js

const { Configuration, OpenAIApi } = require('openai');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

exports.analyzeReport = async (req, res) => {
  try {
    const file = req.file;
    const userInfo = JSON.parse(req.body.userInfo);

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract text from the file
    let extractedText = '';

    if (file.mimetype === 'application/pdf') {
      extractedText = await extractTextFromPDF(file.buffer);
    } else if (
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/png'
    ) {
      extractedText = await extractTextFromImage(file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Parse health metrics
    const metrics = parseHealthMetrics(extractedText, userInfo);

    // Generate AI prompt
    const prompt = generatePrompt(userInfo, metrics);

    // Get AI summary
    const summary = await getAISummary(prompt);

    res.json({ summary });
  } catch (error) {
    console.error('Error processing report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const extractTextFromPDF = async (buffer) => {
  const data = await pdfParse(buffer);
  return data.text;
};

const extractTextFromImage = async (buffer) => {
  const {
    data: { text },
  } = await Tesseract.recognize(buffer, 'eng');
  return text;
};

const parseHealthMetrics = (text, userInfo) => {
  // Implement parsing logic to extract key health metrics
  const metrics = {};

  const lines = text.split('\n');
  lines.forEach((line) => {
    const lowerLine = line.toLowerCase();

    // Glucose
    if (lowerLine.includes('glucose')) {
      metrics.glucose = extractValue(line);
    }

    // Cholesterol
    if (lowerLine.includes('cholesterol')) {
      metrics.cholesterol = extractValue(line);
    }

    // Liver Enzymes (ALT, AST)
    if (lowerLine.includes('alt') || lowerLine.includes('sgpt')) {
      metrics.alt = extractValue(line);
    }
    if (lowerLine.includes('ast') || lowerLine.includes('sgot')) {
      metrics.ast = extractValue(line);
    }

    // Add more metrics as needed
  });

  // Filter out data not matching user's details (if combined report)
  // Implement filtering logic based on userInfo.name, age, etc.

  return metrics;
};

const extractValue = (line) => {
  const match = line.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[0]) : null;
};

const generatePrompt = (userInfo, metrics) => {
  let prompt = `You are a helpful assistant providing an empathetic health summary for a patient. Use the following patient information and lab results to create a summary organized under the headings "What is Good", "What Needs Attention", "What is Critical", and "Next Steps". Use a comforting and positive tone.

Patient Information:
Name: ${userInfo.name}
Age: ${userInfo.age}
Gender: ${userInfo.gender}
Known Medical Conditions: ${userInfo.conditions}

Lab Results:
`;

  for (const [key, value] of Object.entries(metrics)) {
    prompt += `${key}: ${value}\n`;
  }

  prompt += `
Provide practical, personalized advice, and always end with a positive and hopeful note.`;

  return prompt;
};

const getAISummary = async (prompt) => {
  const response = await openai.createCompletion({
    model: 'gpt-4o-mini', // Use 'gpt-4' if available
    prompt: prompt,
    max_tokens: 500,
    temperature: 0.7,
  });

  return response.data.choices[0].text.trim();
};

try {
  // OpenAI API call
} catch (error) {
  console.error('Error with AI API:', error.response.data);
  res.status(500).json({ error: 'AI processing failed' });
}

