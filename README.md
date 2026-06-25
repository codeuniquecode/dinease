# 🍽 DineEase — Restaurant Management System
### TU BCA 8th Semester Project III (CACS452)
**Student:** Unique Shrestha | **Roll:** 6-2-346-37-2021  
**Supervisor:** Bishwas Mathema | **College:** Academia International College

---

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB + Mongoose ODM
- **Frontend:** EJS, Bootstrap 5, Chart.js
- **Real-time:** Socket.io (WebSocket)
- **Auth:** JWT + bcryptjs
- **PDF:** pdfkit
- **QR:** qrcode

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Edit `.env`:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/dineease
SECRET_KEY=your_secret_key
BASE_URL=http://localhost:3000
```

### 3. Seed the database
```bash
npm run seed
```

### 4. Start the server
```bash
npm start
# or for development:
npm run dev
```

### 5. Open browser
```
http://localhost:3000
```

---

## Demo Login Credentials

| Role     | Email                    | Password    |
|----------|--------------------------|-------------|
| Admin    | admin@dineease.com       | admin123    |
| Waiter   | waiter@dineease.com      | waiter123   |
| Kitchen  | kitchen@dineease.com     | kitchen123  |
| Customer | customer@dineease.com    | customer123 |

---

## User Roles & Dashboards

| Role    | Dashboard URL         | Capabilities |
|---------|-----------------------|--------------|
| Admin   | /admin/dashboard      | Full system control, analytics, all algorithms |
| Waiter  | /waiter/dashboard     | Place orders, manage tables, generate bills |
| Kitchen | /kitchen/display      | Real-time order queue with priority scoring |
| Customer| /                     | Browse menu, QR ordering, reservations |

---

## Implemented Algorithms (Project Requirement)

All 5 algorithms are in `services/algorithms.js` — written from mathematical first principles, no external statistical libraries.



### Algorithm 2: Order Priority Scoring (Weighted Normalization)
```
Priority = W1×Norm(WaitTime) + W2×Norm(TableImportance) + W3×Norm(ItemCount)
W1=0.5, W2=0.3, W3=0.2
```
- Recalculated every 2 minutes on Kitchen Display
- Orders sorted using manual insertion sort

### Algorithm 3: Table Recommendation (Seat Utilization Fit Score)
```
FitScore = 100 - ((Capacity - PartySize) / Capacity × 100) - LocationPenalty
LocationPenalty = 20 if VIP/Window table assigned to party < 4
```
- Used during customer reservation flow
- Prevents over-allocation of premium seating


### Algorithm 5: Peak Hour Detection (Mean + Std Dev Thresholding)
```
μ = Σ f(i) / 24     σ = √(Σ(f(i) - μ)² / 24)
Peak if f(hour) > μ + σ
```
- Analyzes 24-hour order frequency distribution
- Highlighted on Analytics dashboard bar chart

---

## Order State Machine
```
Placed → Confirmed → Preparing → Ready → Served → Billed → Completed
```

## Project Structure
```
dineease/
├── app.js                  # Entry point + Socket.io
├── seed.js                 # Database seeder
├── config/                 # DB + env config
├── controller/             # Business logic (5 controllers)
├── middleware/             # Auth (JWT) + Multer
├── model/                  # 7 Mongoose schemas
├── routes/                 # All routes
├── services/
│   └── algorithms.js       # All 5 algorithms
├── views/
│   ├── admin/              # 7 admin views
│   ├── waiter/             # 4 waiter views
│   ├── kitchen/            # 1 kitchen display
│   ├── customer/           # 7 customer views
│   ├── auth/               # Login + Register
│   └── partials/           # Shared components
└── storage/                # Uploaded images
```
