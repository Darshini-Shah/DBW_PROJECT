import os

def read_reqs(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        return set(line.strip() for line in f if line.strip())

req1 = read_reqs('c:/Lavi/Learn/Hackathons/google sol/DBW_PROJECT/backend/requirements.txt')
req2 = read_reqs('c:/Lavi/Learn/Hackathons/google sol/DBW_PROJECT/backend/requirements_utf8.txt')

print("Unique to requirements.txt:")
print(req1 - req2)
print("\nUnique to requirements_utf8.txt:")
print(req2 - req1)
