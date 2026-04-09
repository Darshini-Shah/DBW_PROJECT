import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

# Load API key from .env
load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def structure_text_with_gemini(input_file, output_file):
    # 1. Read the raw OCR text
    with open(input_file, "r", encoding="utf-8") as f:
        raw_text = f.read()

    # 2. Setup the model
    model = genai.GenerativeModel('gemini-1.5-flash')

    # 3. Create the prompt (The most important part!)
    prompt = f"""
    You are an expert data analyst working for an NGO. 
    Below is raw text extracted via OCR from multiple hand-filled community survey forms.
    
    TASK:
    - Identify individual survey reports in the text.
    - Extract: Resident Name, Location, Primary Need (e.g., Food, Water, Medical), and Urgent Remarks.
    - If a checkbox was marked (like "[X] Urgent"), note it as a high priority.
    - Format the final output as a VALID JSON LIST of objects.

    RAW TEXT:
    {raw_text}
    """

    print("Sending data to Gemini...")
    response = model.generate_content(prompt)
    
    # 4. Clean and save the response
    # Gemini sometimes wraps JSON in ```json blocks, so we strip those
    raw_json = response.text.replace('```json', '').replace('```', '').strip()
    
    try:
        data = json.loads(raw_json)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        print(f"Successfully created {output_file}")
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        print("Raw response from AI:", response.text)

if __name__ == "__main__":
    structure_text_with_gemini("./data/output/raw_extracted_content.txt", "./data/structured_output/structured_surveys.json")