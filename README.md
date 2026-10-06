# BRL Task 3 — Chat Application

A real-time 1:1 chat application demonstrating core backend skills:
**authentication, REST APIs, database operations, WebSockets, basic security,
API documentation, and clean project structure.**

Register an account, see who else is registered, open a chat, and exchange
messages instantly over WebSockets — messages are stored in MongoDB and the
full history is retrievable through REST.

> **Demo tip — two users on one device:** open the app in two browser tabs and
> log in as a different user in each tab (the token is stored in
> `sessionStorage`, which is per-tab). Both sessions stay independent, so you
> can watch messages arrive live between the two users on one machine.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express.js |
| Real-time | Socket.IO (WebSocket) |
| Database | MongoDB + Mongoose |
| Auth | JWT (`jsonwebtoken`) + bcryptjs password hashing |
| Frontend | React 18 + Vite |
| Deployment | Backend → Render, Frontend → Vercel |

## Features

- Register / login with input validation, duplicate-email protection, and bcrypt-hashed passwords
- JWT authentication for both REST routes **and** the WebSocket handshake
- Multiple independent sessions per device (per-tab token storage)
- List other users, start a conversation with any of them
- Real-time 1:1 messaging over WebSockets (with ack-confirmed delivery)
- Message history persisted in MongoDB and paginated via REST (`limit` / `before`)
- Online presence indicators (green dot / Online-Offline status)
- Sidebar last-message previews that update live
- Participant-only authorization: knowing a conversation id is not enough to read it
- Rate limiting on auth endpoints, CORS allowlist, security headers, central error handler
- No secrets committed: `.env` is gitignored, `.env.example` documents what's needed

## Project structure

```
BRL_Task3/
├── backend/
│   ├── server.js                 # entry point: Express + Socket.IO wiring
│   ├── db.js                     # MongoDB connection
│   ├── socket.js                 # WebSocket auth, messaging, presence
│   ├── middleware/
│   │   ├── auth.js               # JWT verification (requireAuth)
│   │   └── rateLimit.js          # dependency-free rate limiter
│   ├── models/
│   │   ├── User.js
│   │   ├── Conversation.js       # pairKey enforces one chat per pair
│   │   └── Message.js
│   ├── routes/
│   │   ├── authRoutes.js         # /auth/*
│   │   ├── userRoutes.js         # /users
│   │   └── conversationRoutes.js # /conversations/*
│   ├── scripts/
│   │   └── migrate-pairkey.js    # one-time data fix (safe to re-run)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # session gate: auth screen vs chat screen
│   │   ├── api.js                # fetch wrapper + per-tab session storage
│   │   ├── socket.js             # Socket.IO client factory
│   │   ├── components/
│   │   │   ├── AuthScreen.jsx    # register / login
│   │   │   └── ChatScreen.jsx    # sidebar, messages, composer, presence
│   │   └── styles.css
│   ├── .env.example
│   └── package.json
├── BRL_Task3.postman_collection.json
├── .gitignore
└── README.md
```

## Local setup

### Prerequisites
- Node.js 18+ and npm
- MongoDB running locally (or an Atlas connection string)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit the values
npm run dev               # or: npm start
```

`.env`:

```
DATABASE_URL=mongodb://127.0.0.1:27017/brlChatDB
JWT_SECRET=<long random string, e.g. openssl rand -hex 64>
PORT=5000
CLIENT_URL=http://localhost:5173
```

The API + WebSocket server starts on `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173`.

### 3. Try it

1. Register **Alice** in tab 1, register **Bob** in tab 2 (different emails).
2. In tab 1 click Bob → say hi → watch it appear instantly in tab 2.
3. Reload either tab — history is still there, served from MongoDB.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | MongoDB connection string |
| `JWT_SECRET` | backend | Signs/verifies JWTs — never commit the real one |
| `PORT` | backend | HTTP + WebSocket port (Render sets this automatically) |
| `CLIENT_URL` | backend | Allowed frontend origin(s) for CORS, comma-separated |
| `VITE_API_URL` | frontend | Backend base URL baked in at build time |

## API documentation

Import [`BRL_Task3.postman_collection.json`](./BRL_Task3.postman_collection.json)
into Postman. Run **Login - success** first — it stores the token in the
`authToken` variable used by every protected request.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | No | Create account (201 / 400 / 409) |
| POST | `/auth/login` | No | Get JWT (200 / 400 / 401 / 429) |
| GET | `/auth/me` | Yes | Current user's profile |
| POST | `/auth/logout` | Yes | Documented logout step |
| GET | `/users` | Yes | All users except me |
| POST | `/conversations` | Yes | Find-or-create 1:1 conversation (201/200) |
| GET | `/conversations` | Yes | My conversations with last message |
| GET | `/conversations/:id` | Yes | One conversation (403 for non-participants) |
| GET | `/conversations/:id/messages` | Yes | History, `?limit=` & `?before=` paging |
| GET | `/health` | No | Health check for uptime monitors |

All responses follow `{ "success": true, ... }` or `{ "success": false, "message": "..." }`.

### WebSocket events

| Direction | Event | Payload |
|---|---|---|
| client → server | `message:send` | `{ conversationId, content }` → ack `{ success, message }` |
| server → client | `message:new` | `{ message, conversationId }` (to **both** participants) |
| server → client | `conversation:new` | `{ conversation }` when someone starts a chat with you |
| server → client | `presence:update` | `{ userId, online }` |
| client → server | `presence:list` | → replies with online user ids |

The Socket.IO handshake must include `auth: { token: <JWT> }`; connections
without a valid token are rejected before any event is exchanged.

## Deployment

**Backend → Render**
1. Create a Web Service from the repo, root directory `backend`.
2. Build command `npm install`, start command `npm start`.
3. Set `DATABASE_URL` (MongoDB Atlas), `JWT_SECRET`, and
   `CLIENT_URL=https://<your-app>.vercel.app`.
4. Render sets `PORT` automatically; WebSockets work on the same port.

**Frontend → Vercel**
1. Import the repo, root directory `frontend`, framework preset **Vite**.
2. Set `VITE_API_URL=https://<your-app>.onrender.com`.
3. Deploy — the build outputs `dist/`.

> Deploy URLs will be added here once the project is deployed.

## Design notes (for the submission write-up)

- **Authentication approach** — stateless JWTs: register hashes the password
  with bcrypt (cost 10) and login verifies with `bcrypt.compare`, returning a
  1-day token signed by `JWT_SECRET`. The same token guards REST (via the
  `Authorization` header + `requireAuth` middleware) and the WebSocket
  handshake (verified in Socket.IO middleware before `connection`).
  Login returns the same 401 message for unknown email and wrong password so
  accounts can't be enumerated.
- **Why `sessionStorage`** — `localStorage` is shared across tabs, so two tabs
  would overwrite each other's token. `sessionStorage` is per-tab, which is
  exactly the required "Tab 1 = User A, Tab 2 = User B on one device" setup.
- **WebSocket implementation** — `socket.js` maps each user id to the set of
  their open sockets (multiple tabs/devices). `message:send` validates the
  sender is a participant, persists the message, updates `lastMessage`, then
  emits `message:new` to every socket of **both** participants — the sender
  included, so a second tab of the same user stays in sync. Delivery is
  ack-confirmed back to the sender.
- **Database structure**
  - `users`: name, unique email, bcrypt hash (never returned), createdAt
  - `conversations`: participants[2], unique `pairKey` (sorted ids joined),
    lastMessage, timestamps
  - `messages`: conversation ref (indexed), sender ref, content (≤2000
    chars), timestamps
  - A unique index on the participants *array* would wrongly allow only one
    conversation per user (MongoDB indexes array elements individually), so
    uniqueness is enforced on the canonical `pairKey` string instead.
- **Rate limiting** — a small dependency-free fixed-window limiter sits on
  `/auth` (50 requests / 15 min / IP+route) to slow credential stuffing.

## Verification performed

- REST: register (201/400/409), login (200/401), `/users` (200/401),
  create conversation (201/200 idempotent/400 self/400 bad id),
  messages (200, participant-only 403/401), persistence checked in MongoDB
  (users/conversations/messages collections + bcrypt `$2a$` hashes).
- WebSocket: two authenticated clients exchanged messages — both received
  `message:new` live, acks succeeded, invalid tokens rejected at handshake.
- UI: two browser tabs logged in as different users exchanged messages in
  real time without reloading; history, presence, and sidebar previews
  verified; production build (`npm run build`) passes.

## GitHub

The repository includes source code, this README, `.gitignore`, and
`.env.example` files — no `.env`, API keys, passwords, or database
credentials are committed.
