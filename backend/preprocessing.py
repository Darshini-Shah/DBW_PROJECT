import os
from pdf2image import convert_from_path
import easyocr
import numpy as np
from PIL import Image
from dotenv import load_dotenv
    
# Load the variables from .env
load_dotenv()

# Get the paths from environment variables
POPPLER_PATH = os.getenv('POPPLER_PATH')
INPUT_DIR = "./data/input"
TEMP_IMAGE_DIR = "./data/temp_images"
RAW_TEXT_FILE = "./data/output/raw_extracted_content.txt"

reader = easyocr.Reader(['en'])

# Create directories if they don't exist
os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)
os.makedirs(os.path.dirname(RAW_TEXT_FILE), exist_ok=True)

def ocr_pdf_to_text(pdf_path):
    """Converts a single PDF to images using Poppler and performs OCR via EasyOCR."""
    print(f"--- OCR Extracting: {os.path.basename(pdf_path)} ---")
    
    try:
        # Convert PDF pages to list of PIL images using the Poppler path
        pages = convert_from_path(pdf_path, 300, poppler_path=POPPLER_PATH)
    except Exception as e:
        print(f"Error converting PDF {pdf_path}: {e}")
        print("Check if POPPLER_PATH is correct in the script.")
        return ""
    
    full_pdf_text = f"\n\nSOURCE_FILE: {os.path.basename(pdf_path)}\n"
    
    for i, page in enumerate(pages):
        # Save page as image for reference
        img_name = f"{os.path.basename(pdf_path)}_page_{i}.jpg"
        img_path = os.path.join(TEMP_IMAGE_DIR, img_name)
        page.save(img_path, 'JPEG')
        
        # Convert PIL image to numpy array for EasyOCR
        img_array = np.array(page)
        
        # Perform OCR (detail=0 returns just the strings)
        results = reader.readtext(img_array, detail=0)
        text = " ".join(results)
        
        full_pdf_text += f"\n--- Page {i+1} ---\n{text}"
        print(f"  Finished Page {i+1}")
        
    return full_pdf_text

def main():
    if os.path.exists(RAW_TEXT_FILE):
        os.remove(RAW_TEXT_FILE)

    if not os.path.exists(INPUT_DIR):
        print(f"Directory {INPUT_DIR} not found.")
        return

    pdf_files = [f for f in os.listdir(INPUT_DIR) if f.endswith('.pdf')]
    
    if not pdf_files:
        print(f"No PDF files found in {INPUT_DIR}.")
        return

    for pdf_file in pdf_files:
        path = os.path.join(INPUT_DIR, pdf_file)
        extracted_text = ocr_pdf_to_text(path)
        
        with open(RAW_TEXT_FILE, "a", encoding="utf-8") as f:
            f.write(extracted_text)

    print(f"\n✅ Extraction Complete! '{RAW_TEXT_FILE}' is ready.")

if __name__ == "__main__":
    main()