# Dependencies Fix Script for Windows

If you are seeing 'vite' is not recognized or EPERM errors, follow these steps:

1. Close all VS Code windows, terminals, and any other programs that might be using the project folder.
2. Open a PowerShell terminal as Administrator (optional but recommended for EPERM issues).
3. Run the following commands:

```powershell
# Navigate to the frontend directory
cd "c:\Lavi\Learn\Hackathons\google sol\dbw_project\frontend"

# Force delete node_modules and package-lock.json
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

# Clean npm cache
npm cache clean --force

# Reinstall dependencies
npm install
```

4. Once done, try running the dev server again:
```powershell
npm run dev
```
