import os
import requests
from dotenv import load_dotenv

load_dotenv()
token = os.getenv("HF_TOKEN")

API_URL = "https://router.huggingface.co/v1/chat/completions"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# We switch the suffix to ':novita' or ':cerebras'
# These providers are much more likely to support Llama 3.1
payload = {
    "model": "meta-llama/Llama-3.1-8B-Instruct:novita",
    "messages": [
        {"role": "system", "content": "You are a helpful marketing assistant."},
        {"role": "user", "content": "Write a 5-word slogan for a coffee shop."}
    ],
    "max_tokens": 50
}

print("Testing Llama via the Novita provider...")

try:
    response = requests.post(API_URL, headers=headers, json=payload)
    result = response.json()
    
    if "choices" in result:
        print("--- SUCCESS ---")
        print(f"AI Response: {result['choices'][0]['message']['content']}")
    else:
        print(f"FAILED: {result}")
except Exception as e:
    print(f"Error Details: {e}")