/**
 * Document & Course Syllabus Parser for Wolfe OS
 * Extracts text from PDFs and TXT files, then passes to Gemini AI for syllabus timeline extraction.
 */

import { getTodayIso } from './calendarUtils.js';
import { extractSyllabusDatesWithAI } from './aiService.js';

let cachedPdfJs = null;

/**
 * Lazily load PDF.js library only when a PDF is uploaded,
 * preventing 1.3MB of PDF decoding code from bloating initial app startup.
 */
async function getPdfJsLib() {
  if (cachedPdfJs) return cachedPdfJs;
  const pdfjsLib = await import('pdfjs-dist');
  try {
    const pdfWorkerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerModule.default || pdfWorkerModule;
    }
  } catch (err) {
    console.warn("Could not load bundled pdf.worker, continuing with inline worker fallback:", err);
  }
  cachedPdfJs = pdfjsLib;
  return pdfjsLib;
}

/**
 * Extract slide text and speaker notes from a PowerPoint (.pptx) presentation
 * Parses the OpenXML ZIP structure directly using standard browser APIs without external dependencies.
 */
export async function extractTextFromPptx(fileOrBuffer) {
  try {
    let uint8;
    if (fileOrBuffer instanceof ArrayBuffer) {
      uint8 = new Uint8Array(fileOrBuffer);
    } else if (ArrayBuffer.isView(fileOrBuffer)) {
      uint8 = new Uint8Array(fileOrBuffer.buffer, fileOrBuffer.byteOffset, fileOrBuffer.byteLength);
    } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
      const buffer = await fileOrBuffer.arrayBuffer();
      uint8 = new Uint8Array(buffer);
    } else {
      return '';
    }

    const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);

    // 1. Locate End of Central Directory (EOCD) signature: 0x06054b50
    let eocdOffset = -1;
    for (let i = uint8.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    const slides = [];

    if (eocdOffset !== -1) {
      const cdSize = view.getUint32(eocdOffset + 12, true);
      const cdOffset = view.getUint32(eocdOffset + 16, true);
      let p = cdOffset;
      const cdEnd = cdOffset + cdSize;

      while (p < cdEnd && p + 46 <= uint8.length) {
        if (view.getUint32(p, true) !== 0x02014b50) break;

        const compMethod = view.getUint16(p + 10, true);
        const compSize = view.getUint32(p + 20, true);
        const fnLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const localHeaderOffset = view.getUint32(p + 42, true);

        const fnBytes = uint8.subarray(p + 46, p + 46 + fnLen);
        const filename = new TextDecoder('utf-8', { fatal: false }).decode(fnBytes);

        // Target slide XML and notes XML (e.g. ppt/slides/slide1.xml, ppt/notesSlides/notesSlide1.xml)
        const isSlide = /^ppt\/slides\/slide\d+\.xml$/i.test(filename);
        const isNotes = /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(filename);

        if ((isSlide || isNotes) && localHeaderOffset + 30 <= uint8.length) {
          const localFnLen = view.getUint16(localHeaderOffset + 26, true);
          const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
          const dataOffset = localHeaderOffset + 30 + localFnLen + localExtraLen;
          const compressedData = uint8.subarray(dataOffset, dataOffset + compSize);

          try {
            let xmlText = '';
            if (compMethod === 8 && typeof DecompressionStream !== 'undefined') {
              const ds = new DecompressionStream('deflate-raw');
              const writer = ds.writable.getWriter();
              writer.write(compressedData);
              writer.close();
              xmlText = await new Response(ds.readable).text();
            } else if (compMethod === 0) {
              xmlText = new TextDecoder('utf-8', { fatal: false }).decode(compressedData);
            }

            if (xmlText) {
              const textMatches = [...xmlText.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)].map(m => m[1]);
              const slideText = textMatches.join(' ').replace(/\s+/g, ' ').trim();
              if (slideText) {
                const numMatch = filename.match(/\d+/);
                const slideNum = numMatch ? parseInt(numMatch[0], 10) : slides.length + 1;
                slides.push({
                  number: slideNum,
                  type: isNotes ? 'notes' : 'slide',
                  text: slideText
                });
              }
            }
          } catch (e) {
            // Non-blocking per slide
          }
        }

        p += 46 + fnLen + extraLen + commentLen;
      }
    }

    // Fallback: If zip parsing didn't find slides (e.g. older .ppt format or non-standard zip), extract text tokens
    if (slides.length === 0) {
      const rawString = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
      const textMatches = [...rawString.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)].map(m => m[1]);
      if (textMatches.length > 0) {
        return textMatches.join('\n').trim();
      }

      // Legacy PPT binary string regex search (runs of ASCII printable characters)
      const asciiMatches = rawString.match(/[A-Za-z0-9\s.,!?:;\-()/%$+]{6,}/g) || [];
      const cleanAscii = asciiMatches
        .filter(m => !m.includes('xml') && !m.includes('schema') && !m.includes('http') && m.trim().length > 10)
        .slice(0, 100);
      if (cleanAscii.length > 0) {
        return cleanAscii.join('\n').trim();
      }
    }

    // Sort slides in natural order
    slides.sort((a, b) => a.number - b.number);

    let result = '';
    for (const s of slides) {
      if (s.type === 'slide') {
        result += `\n--- Slide ${s.number} ---\n${s.text}\n`;
      } else {
        result += `[Slide Notes: ${s.text}]\n`;
      }
    }

    return result.trim();
  } catch (err) {
    console.warn("PPTX text extraction warning:", err);
    return '';
  }
}

/**
 * Extract plain text from an uploaded File (PDF, PPTX, PPT, TXT, MD, CSV)
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

  // 2. PowerPoint Presentations (.pptx, .ppt)
  if (
    fileName.endsWith('.pptx') || 
    fileName.endsWith('.ppt') || 
    fileType.includes('presentation') || 
    fileType.includes('powerpoint')
  ) {
    try {
      const pptxText = await extractTextFromPptx(file);
      if (pptxText && pptxText.trim().length > 20) {
        return pptxText;
      }
    } catch (err) {
      console.warn("PPTX parser notice, attempting fallback:", err);
    }
  }

  // 3. PDF file
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    try {
      const pdfjsLib = await getPdfJsLib();
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

  // 4. Fallback text read
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
