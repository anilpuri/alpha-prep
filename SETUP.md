# Alpha — SSC CGL Mock Test App · Setup Guide

## What's done for you
- Expo SDK 56 app scaffolded (`cgl-ace/`)
- Firebase config wired to project **alpha-58283**
- 25,932 SSC CGL questions cleaned into 513 Firestore bank chunks
- Data upload script already run (or running)

---

## Firebase Console steps (5 min, do once)

### 1. Enable Email/Password Auth
1. Firebase Console → **Build → Authentication → Get started**
2. **Sign-in method → Email/Password → Enable → Save**

### 2. Create Firestore Database
1. Firebase Console → **Build → Firestore Database → Create database**
2. Location: **asia-south1 (Mumbai)** — closest to India, cheapest latency
3. Start in **Production mode** (our rules handle access)

### 3. Deploy security rules
Copy `firestore.rules` content into:
Firebase Console → Firestore → **Rules** tab → paste → Publish

### 4. Customize email templates (optional but nice)
Firebase Console → **Authentication → Templates**
- Customize sender name to "Alpha"
- Email verification subject: "Verify your Alpha account"

---

## Running the app

```bash
cd cgl-ace
npm start          # opens Expo dev server
# then scan QR with Expo Go app on your phone
```

## Uploading data (already done — run only if Firestore is wiped)

```bash
# Put your service account key at scripts/serviceAccountKey.json
node scripts/clean-questions.js      # regenerate seed files
node scripts/upload-firestore.js     # upload to Firestore
```

---

## App flow

```
Login / Register
  └─ Verify email (Firebase sends automatically)
       └─ Dashboard (Report Card)
            ├─ Practice tab → Subject → Topic → Sub-topic
            │     └─ Config modal: questions, mode, pool
            │           └─ Test screen (Practice / Exam / Free)
            │                 └─ Result screen + solution review
            └─ Report Card tab → Overall / Subject / Topic analytics
```

## Modes
| Mode | Timer | Can leave | Answer shown |
|------|-------|-----------|--------------|
| Practice 🟡 | ✅ 36s/Q | ❌ | After submit |
| Exam 🔴 | ✅ auto-submit | ❌ | After submit |
| Free 🟢 | ❌ | ✅ | Immediately |

## Question pool
- **Unattempted** — questions you've never answered (default)
- **Attempted** — revisit questions you've already seen
- **All** — entire topic bank regardless of history

## Marking scheme
- Default: **+2 correct / -0.5 wrong** (from real PYQ marks)
- Auto-detected from question data

## Analytics tracked
- Accuracy per topic, subject, overall
- Speed (seconds per question)
- Correct / Wrong / Skipped breakdown
- Percentile and rank vs all users (per topic leaderboard)
- Weakest vs strongest topics

---

## Build for production (when ready)

```bash
npm install -g eas-cli
eas login
eas build --platform android   # generates .apk / .aab
```
