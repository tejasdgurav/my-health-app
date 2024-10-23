require('dotenv').config();
const OpenAI = require('openai');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');

// Ensure OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OpenAI API key is missing');
}

// OpenAI configuration (new initialization)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.analyzeReport = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract text from the file
    let extractedText = '';

    if (file.mimetype === 'application/pdf') {
      extractedText = await extractTextFromPDF(file.buffer);
    } else if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      extractedText = await extractTextFromImage(file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Analyze the extracted text and get the summary
    const summary = await analyzeExtractedText(extractedText);

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
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    throw new Error('PDF processing failed');
  }
};

// Extract text from an image buffer using Tesseract
const extractTextFromImage = async (buffer) => {
  try {
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
    return text;
  } catch (error) {
    console.error('Tesseract error:', error.message);
    throw new Error('Image recognition failed');
  }
};

// Analyze the extracted text by sending it to OpenAI and ensuring no hallucinations
const analyzeExtractedText = async (extractedText) => {
  // Restrict AI to focus only on the data in the report
  const prompt = `You are an AI assistant tasked with analyzing a medical report. 
Your job is to provide an accurate summary based only on the facts present in the report. 
Do not make assumptions, do not hallucinate any data, and only summarize the information that is present in the report. 

Here is the report text: 
"${extractedText}"

Please provide a clear, simple, and understandable health summary for the patient using the following format:

1. Health Summary: Provide an overview of the patient's health based strictly on the report. No assumptions.
2. What’s Good: Highlight the positive aspects from the report.
3. What Needs Attention: Mention the aspects that need monitoring or are slightly out of range.
4. What’s Critical: Mention any critical aspects that the patient should be aware of.
5. What You Should Do: Suggest clear next steps based on the report data. No new data should be introduced.

Ensure the language is simple and clear, and the summary reflects exactly what is present in the report.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.2,  // Low temperature to avoid creative outputs and stick to facts
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error with AI API:', error.response ? error.response.data : error.message);
    throw new Error('AI processing failed');
  }
};
