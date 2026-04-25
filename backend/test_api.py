import requests

try:
    response = requests.get('http://localhost:8000/health')
    print("Health check:", response.status_code, response.text)
    
    response = requests.get('http://localhost:8000/api/issues?latitude=0&longitude=0')
    print("Issues check:", response.status_code, response.text)
except Exception as e:
    print("Request failed:", e)
