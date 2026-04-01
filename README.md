# Waycontrol

High-performance system controller. Next.js (TS) + Django (Python 3.13+).

## Execution

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
