
# 📬 Smart Gmail Assistant
### AI-Powered Email Highlighting & Calendar Automation for Gmail

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![Groq AI](https://img.shields.io/badge/Groq-LLaMA%203.3%2070B-orange)
> 🚀 Coming soon to the Chrome Web Store!

---

## 🌟 What It Does
Smart Gmail Assistant uses **Groq AI (LLaMA 3.3 70B)** to generate 
personalised email-highlighting rules based on your profession and 
interests — then applies them to your Gmail inbox in real time.

- 🔴 **HIGH priority** — deadlines, payments, urgent tasks  
- 🟡 **MEDIUM priority** — meetings, opportunities, events  
- 🟢 **LOW priority** — newsletters, general info  

---

## 📸 Demo
<!-- Add your screenshots here -->

<img width="413" height="600" alt="Untitled design (1)" src="https://github.com/user-attachments/assets/4c1d5642-7101-4835-8abf-862a8275bfed" />

<img width="602" height="614" alt="image" src="https://github.com/user-attachments/assets/b64e637d-7bcf-4a28-bd68-eb410f1786d8" />

<img width="900" height="1000" alt="image" src="https://github.com/user-attachments/assets/1e7de284-27e5-442e-8959-4c65f72d304d" />


<img width="600" height="792" alt="image" src="https://github.com/user-attachments/assets/00bcc059-09cb-4a2e-b961-56a587cc0b9c" />


<img width="700" height="915" alt="image" src="https://github.com/user-attachments/assets/637b57f1-f24e-4456-a323-f1aad1bfe572" />

---

## 🚀 Features

- **AI Rule Generation** — Tell the AI your profession and what 
  emails matter. It generates 5–8 personalised highlighting rules 
  using LLaMA 3.3 70B via Groq API
- **Real-time Gmail Highlighting** — Content script highlights 
  matching emails directly inside Gmail with colour-coded borders
- **Priority Filter Panel** — Floating panel lets you filter inbox 
  by HIGH / MEDIUM / LOW priority instantly
- **Google Calendar Integration** — Scans highlighted emails, 
  extracts deadlines (DD/MM/YYYY, "tomorrow", "in 3 days"), and 
  pre-fills Google Calendar events
- **Chrome Profile Aware** — Always highlights the Gmail account 
  signed into your Chrome browser

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Platform | Chrome Extension, Manifest V3 |
| Frontend | Vanilla JavaScript, HTML, CSS |
| AI | Groq API — LLaMA 3.3 70B |
| Auth | Google OAuth 2.0 (chrome.identity) |
| Storage | chrome.storage.local |
| APIs | Google Calendar API |

---

## ⚙️ How to Use

1. Install the extension from the Chrome Web Store *(coming soon)*  
2. Click the extension icon → save your free 
   [Groq API key](https://console.groq.com/keys)
3. Click **"Go to Setup"** → fill in your profile
4. AI generates your personalised rules → Gmail opens with 
   highlights applied automatically
   
---   

## 🧩 Challenges I Solved

- Debugged MV3-specific issues: content scripts can't open tabs, 
  service workers breaking identity API
- Fixed form data clearing on submit in Chrome extensions
- Switched AI providers mid-build (Gemini quota → Groq API)
- Built a smart date extractor parsing natural language deadlines 
  from email snippets

---

## 🏆 Why This Project Stands Out

- Solves a **real problem** I faced as a student
- Combines **AI + Chrome APIs + OAuth + Calendar API**
- Built entirely with **Vanilla JS** — no frameworks
- **Published on Chrome Web Store** *(coming soon)*

---

## 🤝 Contributing
Contributions, issues and feature requests are welcome!

## ⭐ Support
If this helped you, give it a ⭐ on GitHub!

## 📬 Let's Connect
Open to collaboration, feedback and opportunities 🚀
