# Tea Machine Control System

## Project Overview

A web-based control interface for an ESP32-powered automated tea brewing system, developed as part of EEE4022S. The system demonstrates modern web technologies integrated with embedded systems through Web Bluetooth communication.

## System Architecture

### Frontend
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **UI Components**: Tailwind CSS with shadcn/ui
- **State Management**: Zustand
- **Communication**: Web Bluetooth API

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Email/password with approval system
- **Real-time Updates**: WebSocket connections

### Hardware Interface
- **Protocol**: Bluetooth Low Energy (BLE)
- **Target Device**: ESP32-based tea brewing system
- **Communication**: JSON state messages and text commands

## Key Features

- Real-time monitoring of brewing parameters (temperature, timing, status)
- Remote control of heating, brewing, and dispensing functions
- User authentication and access control system
- Responsive web interface compatible with mobile devices
- Bluetooth device management and connection handling

## Technical Implementation

### Bluetooth Configuration
- **Service UUID**: `0000A000-0000-1000-8000-00805F9B34FB`
- **Command Characteristic**: `0000A001-0000-1000-8000-00805F9B34FB`
- **State Characteristic**: `0000A002-0000-1000-8000-00805F9B34FB`

### Database Schema
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Command Interface
The system accepts text-based commands:
- `SYS:ON/OFF` - System power control
- `HEAT:START/STOP` - Heating element control
- `BREW:START/STOP` - Brewing cycle management
- `DISPENSE:TASTE/CUP/STOP` - Liquid dispensing control

### State Monitoring
Real-time JSON state updates:
```json
{
  "sys": "ON",
  "T": 97.2,
  "heater": 1,
  "heating": 1,
  "brew": "SOAKING",
  "brew_ms": 12345,
  "pump": 0,
  "dispense": "NONE",
  "needs_refill": 0
}
```

## Development Setup

### Prerequisites
- Node.js (v18+)
- Modern browser with Web Bluetooth support (Chrome/Edge)
- Supabase account for backend services

### Environment Configuration
```env
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### Installation
```bash
npm install
npm run dev
```

### Admin Setup
Configure admin users in:
- `src/pages/Dashboard.tsx`
- `src/pages/Admin.tsx`

```typescript
const adminEmails = ["admin@example.com"];
```

## Browser Compatibility

| Browser | Platform | Web Bluetooth Support |
|---------|----------|----------------------|
| Chrome  | Desktop/Android | ✅ Full Support |
| Edge    | Desktop/Android | ✅ Full Support |
| Safari  | All Platforms   | ❌ Not Supported |
| Firefox | All Platforms   | ⚠️ Experimental |

## Project Structure

```
src/
├── components/ui/        # Reusable UI components
├── lib/bluetooth.ts      # Web Bluetooth API wrapper
├── pages/               # Application pages
├── store/               # State management
└── integrations/        # Backend integration
```

## Learning Outcomes

This project demonstrates:
- Integration of web technologies with embedded systems
- Real-time communication protocols (Bluetooth LE)
- Modern web development practices (React, TypeScript)
- Database design and user authentication
- Responsive UI/UX design principles
- IoT device control and monitoring

## Future Enhancements

- PWA implementation for mobile app experience
- Advanced brewing algorithms and presets
- Historical data logging and analytics
- Multi-device support and management
- Voice control integration

---

**EEE4022S Final Year Project**  
*University of Cape Town*