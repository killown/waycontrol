# Waycontrol

Control the compositor from your smartphone. Next.js (TS) + Django (Python 3.13+).

<img width="420" height="922" alt="Screenshot 2026-04-01 at 14-24-44 WayControl" src="https://github.com/user-attachments/assets/51714865-0c82-41c6-ba14-7aa61246b916" />

### Backend
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

### Frontend
cd frontend
bun install
bun dev

## Structure
- Core Logic: remote_api/consumers.py
- Frontend: Next.js 15+, TypeScript, Bun
- Protocol: Django Channels
- System: Linux/Wayland Control
