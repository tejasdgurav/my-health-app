require('dotenv').config();
const OpenAI = require('openai');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');  // For image preprocessing
const { exec } = require('child_process');  // To run external commands (e.g., Poppler)

const fs = require('fs');
const path = require('path');

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

    // Attempt text extraction from PDF
    let extractedText = await extractTextFromPDF(file.buffer);

    // If no text is found, try OCR on the PDF
    if (!extractedText || extractedText.trim() === '') {
      extractedText = await extractTextFromImageBasedPDF(file.buffer).catch((err) => {
        console.error('Error extracting text from image-based PDF:', err.message);
        return 'Unable to extract text from the PDF.';
      });
    }

    if (!extractedText || extractedText.trim() === '') {
      extractedText = 'No readable text could be extracted from the report.';
    }

    // Analyze the extracted text and get the summary
    const summary = await analyzeExtractedText(extractedText).catch((err) => {
      console.error('Error analyzing text:', err.message);
      return 'Unable to analyze the report at this time.';
    });

    res.json({ summary });
  } catch (error) {
    console.error('Error processing report:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Extract text from a text-based PDF buffer using pdf-parse
const extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    return '';  // Return empty string if extraction fails
  }
};

// Convert PDF to images using Poppler (pdftoppm) for OCR processing
const convertPDFToImages = async (buffer, outputDir) => {
  const tempPDFPath = path.join(outputDir, 'temp.pdf');
  fs.writeFileSync(tempPDFPath, buffer);

  return new Promise((resolve, reject) => {
    const command = `pdftoppm -png ${tempPDFPath} ${outputDir}/page`;
    exec(command, (err) => {
      if (err) {
        console.error('Error converting PDF to images:', err.message);
        reject('PDF to image conversion failed');
      } else {
        resolve(outputDir);
      }
    });
  });
};

// Perform OCR on image files (output from pdftoppm) using Tesseract.js
const performOCROnImages = async (imageDir) => {
  const files = fs.readdirSync(imageDir).filter((file) => file.endsWith('.png'));
  let fullText = '';

  for (const file of files) {
    const imagePath = path.join(imageDir, file);
    const processedImage = await sharp(imagePath)
      .greyscale()
      .sharpen()
      .normalize()
      .toBuffer();

    const { data: { text } } = await Tesseract.recognize(processedImage, 'eng');
    fullText += text + '\n';
  }

  return fullText;
};

// Extract text from an image-based PDF using pdftoppm (Poppler) + Tesseract.js for OCR
const extractTextFromImageBasedPDF = async (buffer) => {
  const tempDir = path.join(__dirname, 'temp_images');

  // Create a temporary directory to store images
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  try {
    // Convert PDF to images using Poppler
    await convertPDFToImages(buffer, tempDir);

    // Perform OCR on the generated images
    const extractedText = await performOCROnImages(tempDir);

    // Clean up temp files
    fs.rmdirSync(tempDir, { recursive: true });

    return extractedText || 'No text extracted from image-based PDF.';
  } catch (error) {
    console.error('Error extracting text from image-based PDF:', error.message);
    return 'Unable to extract text from image-based PDF.';
  }
};

// Analyze the extracted text by sending it to OpenAI and ensuring no hallucinations
const analyzeExtractedText = async (extractedText) => {
  const prompt = `
    I want you to act as a highly empathetic and clear medical expert who explains complex medical diagnoses and conditions in a way that is easy to understand for a non-medical person. Your task is to generate a comprehensive health report based on the provided health report and any medical conditions or diagnoses included.

    This report should be broken down into the following sections:

    1. **Quick Snapshot (Overview)**:
    - Start with a brief summary of the patient’s health:
    - Age and Gender of the patient.
    - Key diagnoses or conditions (e.g., hypothyroidism, diabetes, hypertension, etc.).
    - A list of medications the patient is taking, with a brief explanation of what each medication does.
    - A "Good, Needs Attention, Critical" section:
      - **Good**: Highlight aspects of the patient’s health that are stable or within normal ranges.
      - **Needs Attention**: Mention any areas that require monitoring or adjustment.
      - **Critical**: Identify any critical conditions or risks that require immediate attention or strict adherence to treatment.

    2. **Detailed Health Report**:
    This section should include a detailed analysis of each health condition or diagnosis. Break down each condition with equal emphasis on all conditions while prioritizing the most critical ones.

    **What’s Going On?** 
    Explain what the health conditions are, their potential causes, and how they are affecting the patient. Use simple, plain language so the patient can understand what is happening in their body.

    For each condition, break it down as follows:
    - **Condition 1 (e.g., Hypothyroidism)**:
      - **What is it?**: A simple explanation of the condition and how it affects the body.
      - **Why does it happen?**: Briefly explain the cause or possible cause of the condition (e.g., autoimmune disease, lifestyle factors, etc.).
      - **Symptoms**: List the common symptoms associated with the condition that the patient might experience.
    
    - **Condition 2 (e.g., Overweight/BMI)**:
      - **What is it?**: Explain BMI and what the patient’s BMI means.
      - **Why does it matter?**: Explain the importance of BMI and how being overweight affects overall health.
      - **What can cause it?**: Mention relevant factors like metabolism, thyroid issues, diet, and physical activity.
    
    - **Condition 3 (e.g., Hypertension/Blood Pressure)**:
      - **What does this number mean?**: Explain the patient’s blood pressure readings and what they indicate.
      - **Why does it matter?**: Explain how blood pressure affects the heart and other organs.
      - **What can cause it?**: List possible contributing factors such as weight, thyroid issues, diet, and stress.

    3. **What You Should Do**:
    Provide actionable recommendations for managing each condition. Break this down by:
    - **Condition 1 (e.g., Hypothyroidism)**:
      - **Medication**: Explain the importance of taking prescribed medication and how it works.
      - **Lifestyle**: Provide lifestyle tips like diet, exercise, and stress management to support the condition.
      - **Monitoring**: Explain the importance of regular monitoring (e.g., thyroid function tests, blood sugar levels, etc.).
    
    - **Condition 2 (e.g., Overweight/BMI)**:
      - **Diet and Exercise**: Offer simple suggestions for improving diet and physical activity.
      - **Stress Management**: Recommend stress-relieving activities to support weight management and general health.
    
    - **Condition 3 (e.g., Blood Pressure)**:
      - **Monitoring**: Recommend regular blood pressure checks and when to alert the doctor.
      - **Lifestyle Tips**: Suggest ways to reduce salt, increase potassium, and stay active.

    4. **Why It All Matters**:
    Explain why managing these conditions is important and how they are interconnected. For example:
    - How hypothyroidism affects weight and energy levels.
    - How extra weight raises blood pressure.
    - How controlling blood pressure reduces the risk of heart disease or strokes.
    Make it clear that addressing each condition improves overall health and reduces the risk of complications.

    5. **What to Watch For**:
    Provide a list of warning signs or symptoms the patient should monitor for each condition. For example:
    - If their energy levels drop, they may need a thyroid medication adjustment.
    - If their blood pressure rises above a certain level, they should consult their doctor.

    6. **Next Steps**:
    Provide a clear list of next steps for the patient:
    - **Medication**: Reinforce the importance of adhering to prescribed medication schedules.
    - **Follow-up Appointments**: Suggest when the patient should schedule their next doctor visit or blood tests to monitor progress.
    - **Lifestyle Recommendations**: Encourage small, positive changes that will improve their condition over time.

    7. **In Summary**:
    Wrap up the report with a clear and concise summary:
    - Reassure the patient that their conditions are manageable with proper medication, monitoring, and lifestyle changes.
    - Highlight the key actions they should take to stay in control of their health.
    - Provide encouragement and remind them they’re already taking the right steps.

    **Key Guidelines for Writing the Report**:
    - Use empathetic, supportive language that helps the patient feel informed and in control.
    - Avoid medical jargon. If a medical term must be used, provide a simple explanation.
    - Provide actionable advice in a clear and concise manner that the patient can follow.
    - Emphasize the interconnectedness of their health conditions and why managing each one helps overall well-being.
    - Keep the tone positive and reassuring, ensuring the patient knows their conditions can be managed.
  
    Here's the report text:
    "${extractedText}"
  `;

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
