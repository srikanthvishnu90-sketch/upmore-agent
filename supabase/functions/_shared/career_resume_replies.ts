// FEATURE 16: the plain-words replies to a resume file that cannot be read, and the largest file read. Kept in a module of
// its own (no imports) so a channel's webhook can say the same words without loading the resume reader.
export const RESUME_FILE_MAX_BYTES = 10 * 1024 * 1024;

// ---- the replies: exact, plain, and never a claim that anything was read -------------------------------------------
const PASTE = "or paste the text here";
export const REPLIES = {
  too_large: (mb: string) => `That file is ${mb} MB, and I read resume files up to 10 MB, so I haven't read it. Send a smaller copy (a PDF saved from Word or Google Docs is usually under 1 MB), ${PASTE}.`,
  checksum: "That file didn't arrive whole (it doesn't match the checksum it was sent with), so I haven't read it. Send it again.",
  empty: `That file is empty, so there was nothing to read. Send the resume file again, ${PASTE}.`,
  image: `That's a picture, and I don't read text out of pictures, so I haven't read it. Send your resume as a PDF or Word file, ${PASTE}.`,
  scanned: `That PDF has no text in it: it's a scan or a picture of the page, and I don't read text out of pictures, so I haven't read it. Send the PDF saved from Word or Google Docs, ${PASTE}.`,
  encrypted_pdf: `That PDF is locked with a password, so I can't open it. Send a copy without the password (in most PDF apps: Print, then Save as PDF), ${PASTE}. Please don't send me the password.`,
  protected_docx: `That Word file is protected with a password, so I can't open it. Save a copy without the password and send that, ${PASTE}. Please don't send me the password.`,
  legacy_doc: `That's an older Word file (.doc), which I can't read. Save it as .docx or PDF and send it again, ${PASTE}.`,
  corrupt: (what: string) => `I couldn't open that ${what}: it looks damaged or incomplete, so I haven't read it. Save or export it again and send it, ${PASTE}.`,
  unsupported: (what: string) => `I can't read ${what} files. I read PDF, Word (.docx), RTF and plain-text files, so send it as one of those, ${PASTE}.`,
};
