# HRDK employee app

React Native (Expo SDK 58, Expo Router) app for employees: attendance,
leave (balance, apply, cancel), payslips, documents and profile. It talks to
the HRMS server (`../server`) under `/api/me`.

## Structure

```
src/
  api/client.js   the link to the server: base URL, login keys, token refresh
  api/me.js       every server call (and the /api/me contract the server must offer)
  api/demo.js     sample answers when EXPO_PUBLIC_DEMO=1
  auth/           who is logged in
  ui/             theme, shared components, useLoad hook
  app/            screens (Expo Router: each file is a screen)
    login.js            Employee ID -> OTP
    (tabs)/index.js     Home
    (tabs)/attendance.js
    (tabs)/leave.js
    (tabs)/payslip.js
    (tabs)/more.js      Documents, my details, log out
    apply-leave.js
    payslip/[month].js
```

## Server address

- `.env` (copy `.env.example`): `EXPO_PUBLIC_API_URL` for development, e.g.
  `http://192.168.1.32:3030` (this PC on office Wi-Fi, never `localhost`).
- `eas.json`: the address baked into each build (development / preview / production).
- `EXPO_PUBLIC_DEMO=1` runs on sample data with no server (any ID, OTP `123456`).

## Run

```
npm install
npx expo start          # scan the QR code with Expo Go on your phone
npx expo start --web    # preview in a browser
```

## Build for phones

```
npx eas-cli@latest build --profile preview --platform android      # APK to share for testing
npx eas-cli@latest build --profile production --platform android   # AAB for Google Play
```
