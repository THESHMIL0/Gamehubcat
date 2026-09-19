# 🎮 GameRoom — Full-Stack Multiplayer Social Gaming Platform

GameRoom is a modern, real-time multiplayer social gaming web application. It features custom user accounts, authentication with bcrypt password hashing, persistent SQLite database storage, real-time presence and online status, friend requests, real-time game invitations with 60-second timeouts, floating in-game and lobby chat bubbles, and three complete server-authoritative multiplayer games:

1. **Tic-Tac-Toe (XOX)**: 3x3 real-time multiplayer with win-line animations, turn indicators, draw detection, and rematches.
2. **Rock Paper Scissors**: Simultaneous hidden choices, dramatic reveal animations, live score counters, and rematch engine.
3. **Connect Four**: 7-column x 6-row drop grid with physics-inspired token drops, 4-in-a-row direction detection, and live rematching.

---

## 🚀 Key Features

- **Custom Authentication**: Secure registration and login, password validation, bcrypt hashing, JWT authentication tokens, and persistent sessions.
- **User Profiles & Avatars**: Customizable avatars, display names, bios, account stats (Games Played, Wins, Losses, Win Rate %), and password management.
- **Real-Time Presence**: Socket.IO online presence tracking (`Online`, `Playing Tic-Tac-Toe`, `Playing Connect Four`, `Offline`).
- **Friends System**: Search users by username, send/accept/reject friend requests, friend removal, and real-time status indicators.
- **Game Rooms & Waiting Rooms**: Unique 6-character room codes (`ABC123`), room code copying, waiting room screen with player status, strict two-player enforcement, and join notifications.
- **Real-Time Invitations**: Invite online friends directly from the waiting room or friends list. Recipient receives a live interactive popup to [ACCEPT] or [CANCEL] with 60-second countdown expiration.
- **Floating Live Chat**: Smooth floating bubbles with subtle horizontal offsets that float up and fade out without blocking game controls, with chat history and XSS sanitization.
- **Server-Authoritative Game Logic**: All moves, turns, win conditions, and draws are validated on the server.
- **Responsive Gaming UI**: Sleek dark gaming theme with glass cards, neon accents, touch-friendly 44px+ buttons, mobile bottom navigation, and desktop header navigation.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3 (Modern Dark Gaming Theme with CSS Variables), Vanilla JavaScript (Modular ES Modules)
- **Backend**: Node.js & Express
- **Real-Time Engine**: Socket.IO
- **Database**: SQLite3 with auto-initialization, indexes, and foreign keys
- **Security**: bcryptjs password hashing, JSON Web Tokens (JWT), input sanitization, rate limiting

---

## 📦 Project Structure

```text
GameRoom/
├── public/
│   ├── index.html          # Main single-page application entry
│   ├── style.css           # Modern dark gaming theme styles
│   └── js/
│       ├── app.js          # Core app controller and view router
│       ├── auth.js         # Authentication, registration, and tokens
│       ├── socket.js       # Socket.IO connection and presence events
│       ├── lobby.js        # Lobby games catalog and room code joining
│       ├── profile.js      # Profile viewing, avatar picker, and stats
│       ├── friends.js      # Friends search, requests, and management
│       ├── invitations.js  # Real-time game invitation popups & timer
│       ├── chat.js         # Floating chat bubbles & input handlers
│       └── games/
│           ├── tictactoe.js# Real-time Tic-Tac-Toe client logic
│           ├── rps.js      # Real-time Rock Paper Scissors client logic
│           └── connect4.js # Real-time Connect Four client logic
├── server.js               # Express & Socket.IO server-authoritative backend
├── database.js             # SQLite database schemas, indexes, and queries
├── package.json            # Node.js project manifest & scripts
├── render.yaml             # Render.com Blueprint deployment configuration
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore configuration
└── README.md               # Beginner-friendly documentation
```

---

## 💻 Local Installation & Setup

Follow these steps to run GameRoom on your local machine:

### 1. Install Node.js
Ensure you have **Node.js (v18, v20, or newer)** installed:
```bash
node -v
npm -v
```
If you do not have Node.js, download it from [nodejs.org](https://nodejs.org/).

### 2. Clone or Download the Project
```bash
git clone https://github.com/your-username/gameroom.git
cd gameroom
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables (Optional)
Copy the example environment file:
```bash
cp .env.example .env
```
Default settings work out of the box (`PORT=3000`, `JWT_SECRET=your_secret_key`).

### 5. Start the Application
```bash
npm start
```
Open your browser and navigate to:
```
http://localhost:3000
```
Open a second browser tab or an Incognito window to register a second user account and play games in real time!

---

## 🚀 Push to GitHub

1. Initialize a new git repository (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit of GameRoom multiplayer platform"
   ```
2. Create a new repository on [GitHub](https://github.com/new).
3. Link and push your repository:
   ```bash
   git branch -M main
   git remote add origin https://github.com/your-username/gameroom.git
   git push -u origin main
   ```

---

## 🌐 Deploy to Render.com

Deploying GameRoom to Render is fast and 100% free:

1. Sign up or log into [Render.com](https://render.com/).
2. Click **New +** in the top navigation and select **Web Service** (or choose **Blueprint** and link your repo).
3. Connect your GitHub repository (`gameroom`).
4. Configure the Web Service settings:
   - **Name**: `gameroom`
   - **Environment**: `Node`
   - **Region**: Select your closest region (e.g. Frankfurt, Oregon, Singapore)
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. In **Environment Variables**, add:
   - `JWT_SECRET`: Enter any secure random string.
   - `NODE_ENV`: `production`
6. Click **Create Web Service**.
7. Render will install dependencies and launch your application. Once built, you will receive your live URL:
   `https://gameroom-xxxx.onrender.com`

> **Note on Render Free Tier**: Web services spin down after 15 minutes of inactivity and take ~30 seconds to wake up on the first request. SQLite files are stored on the service disk; for permanent storage across re-deploys on Render, you can attach a persistent disk or run with the provided SQLite configuration.

---

## 🧪 Testing Checklist

Verify every feature works smoothly:
- [x] **Registration**: Create a new account with validation checks.
- [x] **Login & Session**: Log in and verify session persists on page refresh.
- [x] **Profile**: Edit display name, avatar, bio, and change password.
- [x] **Friends**: Search for another registered user and send a friend request.
- [x] **Friend Request Notification**: Accept friend request from the second account.
- [x] **Presence**: Observe the online indicator update when switching tabs or games.
- [x] **Create Game Room**: Create a Tic-Tac-Toe, RPS, or Connect Four room and receive a 6-character room code.
- [x] **Join Room**: Join using the code from another browser window.
- [x] **Direct Invitation**: Invite an online friend; verify the 60s popup appears on their screen and auto-joins on [ACCEPT].
- [x] **Live Gameplay**: Make turns in Tic-Tac-Toe, RPS, and Connect Four; verify winner detection, scores, and statistics update.
- [x] **Live Floating Chat**: Send messages during the game and in the lobby; watch floating bubbles drift up and fade.
- [x] **Rematch & Leave**: Request rematch and verify both players reset board seamlessly.
