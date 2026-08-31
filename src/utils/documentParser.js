/**
 * Document & Course Syllabus Parser for Wolfe OS
 * Extracts text from PDFs and TXT files, then passes to Gemini AI for syllabus timeline extraction.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getTodayIso } from './calendarUtils.js';
import { extractSyllabusDatesWithAI } from './aiService.js';

// Set up local bundled pdf.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

/**
 * Extract plain text from an uploaded File (PDF, TXT, MD, CSV)
 */
export async function extractTextFromFile(file) {
  if (!file) throw new Error("No file provided");

  const fileType = file.type || '';
  const fileName = (file.name || '').toLowerCase();

  // 1. Text or Markdown file
  if (fileType.includes('text') || fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result || '');
      reader.onerror = (e) => reject(new Error("Failed to read text file"));
      reader.readAsText(file);
    });
  }

  // 2. PDF file
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        useSystemFonts: true,
        disableFontFace: true,
        verbosity: 0
      });
      const pdfDoc = await loadingTask.promise;
      
      let fullText = '';
      const numPages = Math.min(pdfDoc.numPages, 30); // Process up to 30 pages

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `\n--- Page ${i} ---\n` + pageText;
      }

      if (fullText && fullText.trim().length > 50) {
        return fullText;
      }
    } catch (err) {
      console.warn("PDF extraction warning, attempting fallback text:", err);
    }
  }

  // 3. Fallback text read
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result || '');
    reader.readAsText(file);
  });
}

/**
 * Process Syllabus Text with AI and structure into calendar items
 */
export async function processSyllabusDocument(fileOrText) {
  let rawText = '';

  if (typeof fileOrText === 'string') {
    rawText = fileOrText;
  } else {
    rawText = await extractTextFromFile(fileOrText);
  }

  if (!rawText || rawText.trim().length < 20) {
    throw new Error("Could not extract readable text from document. Try copying and pasting the syllabus text directly.");
  }

  const todayIso = getTodayIso();
  const currentYear = new Date().getFullYear();

  // Call AI Service
  const parsedItems = await extractSyllabusDatesWithAI(rawText, {
    todayIso,
    currentYear
  });

  return parsedItems;
}
