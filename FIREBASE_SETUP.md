# TBC Raid Assignments — Firebase Setup

Follow these steps to enable real-time sync so assignments you publish
in the admin view instantly appear on everyone's public view.

---

## Step 1 — Create a Firebase project

1. Go to https://console.firebase.google.com
2. Click **"Add project"**
3. Name it (e.g. `raid-assignments`) — disable Google Analytics if you don't need it
4. Click **Create project**

---

## Step 2 — Enable Firestore

1. In your new project, click **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. Choose **"Start in test mode"** (you can lock it down later)
4. Pick any region close to you (e.g. `us-central`) → **Enable**

---

## Step 3 — Get your config

1. In the Firebase Console, click the ⚙️ gear icon → **"Project settings"**
2. Scroll down to **"Your apps"** → click **"</>  Web"**
3. Register your app (any name, e.g. `raid-web`) — skip Firebase Hosting
4. You'll see a block like this:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "raid-assignments.firebaseapp.com",
  projectId: "raid-assignments",
  storageBucket: "raid-assignments.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

Copy the whole object.

---

## Step 4 — Paste config into the app

Open `src/firebase.js` and replace the placeholder block:

```js
// BEFORE
const firebaseConfig = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  ...
};

// AFTER — paste your real values
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "raid-assignments.firebaseapp.com",
  ...
};
```

---

## Step 5 — Lock down Firestore (recommended)

By default "test mode" allows anyone to read/write for 30 days.
To make it so only your app can write (but anyone can read):

1. In Firebase Console → Firestore → **Rules** tab
2. Replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anyone can read assignments (public view)
    match /raid/assignments {
      allow read: always;
      // Only requests with the right secret can write
      // For a simple setup, leave write open and rely on the admin password
      allow write: if true;
    }
  }
}
```

> For a more secure setup down the road, add Firebase Authentication
> and restrict writes to authenticated users.

---

## Step 6 — Deploy

```bash
npm install     # picks up the firebase package
npm run build
```

Then push to Vercel (or run `npx vercel`).

---

## How it works after setup

| Action | Result |
|--------|--------|
| Admin drags player, clicks **☁️ Save & Publish** | Writes to Firestore |
| Anyone with the public URL opens the page | Reads from Firestore in real-time |
| Admin updates assignments | Public page updates **instantly** (no refresh needed) |
| Firebase not configured | Falls back to localStorage silently |

---

## Changing the admin password

Open `src/AdminView.jsx`, line 13:

```js
const ADMIN_PASSWORD = "raidlead"; // ← change this!
```
