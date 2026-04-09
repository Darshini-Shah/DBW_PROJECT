import os
from pdf2image import convert_from_path
import pytesseract
from PIL import Image

# --- CONFIGURATION ---
# IMPORTANT: Tell your group to update this path or add Tesseract to their System PATH
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

INPUT_DIR = "./data/pdfs"
TEMP_IMAGE_DIR = "./data/temp_images"
RAW_TEXT_FILE = "./data/output/raw_extracted_content.txt"

# Create directories if they don't exist
os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)
os.makedirs(INPUT_DIR, exist_ok=True)

def ocr_pdf_to_text(pdf_path):
    """Converts a single PDF to images and performs OCR."""
    print(f"--- OCR Extracting: {os.path.basename(pdf_path)} ---")
    
    # Convert PDF pages to list of PIL images
    try:
        pages = convert_from_path(pdf_path, 300)
    except Exception as e:
        print(f"Error converting PDF {pdf_path}: {e}")
        return ""
    
    full_pdf_text = f"\n\nSOURCE_FILE: {os.path.basename(pdf_path)}\n"
    
    for i, page in enumerate(pages):
        # Save page as image for debug/reference
        img_name = f"{os.path.basename(pdf_path)}_page_{i}.jpg"
        img_path = os.path.join(TEMP_IMAGE_DIR, img_name)
        page.save(img_path, 'JPEG')
        
        # Perform OCR
        text = pytesseract.image_to_string(page)
        full_pdf_text += f"\n--- Page {i+1} ---\n{text}"
        
    return full_pdf_text

def main():
    # 1. Clear the raw file to start fresh
    if os.path.exists(RAW_TEXT_FILE):
        os.remove(RAW_TEXT_FILE)

    # 2. Loop through all PDFs
    if not os.path.exists(INPUT_DIR):
        print(f"Directory {INPUT_DIR} not found. Please create it.")
        return

    pdf_files = [f for f in os.listdir(INPUT_DIR) if f.endswith('.pdf')]
    
    if not pdf_files:
        print(f"No PDF files found in {INPUT_DIR}. Add your surveys here!")
        return

    for pdf_file in pdf_files:
        path = os.path.join(INPUT_DIR, pdf_file)
        extracted_text = ocr_pdf_to_text(path)
        
        # 3. Append to the raw text file
        with open(RAW_TEXT_FILE, "a", encoding="utf-8") as f:
            f.write(extracted_text)

    print(f"\n✅ Extraction Complete! '{RAW_TEXT_FILE}' is ready for Gemini.")
    print("Next step: Run 'python structure_data.py'")

if __name__ == "__main__":
    main()