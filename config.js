/* ═══════════════════════════════════════════════
   NIZAR NASEER STUDIO — config.js
   Fill in your credentials below, then push to GitHub.
   Vercel will auto-deploy the live site instantly.
   ═══════════════════════════════════════════════ */

window.STUDIO_CONFIG = {

  /* ── 1. WEB3FORMS (booking & review emails) ──────────────────
     Get free key at: https://web3forms.com
     Enter your email → copy the key shown                        */
  web3forms_key: '6be870cf-b9ec-42bd-a26f-8d5f09067bf3',

  /* ── 2. PHOTOGRAPHER EMAIL ───────────────────────────────────
     Your email — all booking notifications go here               */
  photographer_email: 'muhd.nizar1999@gmail.com',

  /* ── 3. GOOGLE CALENDAR (shows real busy dates) ─────────────
     Step A: console.cloud.google.com → New Project
             → Enable "Google Calendar API"
             → Credentials → Create API Key
             → (Optional) Restrict to your domain
     Step B: calendar.google.com → Settings on your calendar
             → Share with specific people → Make publicly visible
             → Copy "Calendar ID" (looks like xxx@gmail.com
               or xxx@group.calendar.google.com)                  */
  google_api_key:     'AIzaSyDeK4LMmFCek12tbyOcNOUq07iRcJqq0dI',
  google_calendar_id: 'muhd.nizar1999@gmail.com',

  /* ── 4. CLOUDINARY (photo uploads — free CDN storage) ───────
     Sign up free at cloudinary.com → get Cloud Name from dashboard
     Settings → Upload → Add Upload Preset → set to Unsigned     */
  cloudinary_cloud_name:    'YOUR_CLOUD_NAME',      // e.g. 'dxyz123abc'
  cloudinary_upload_preset: 'YOUR_UPLOAD_PRESET',   // e.g. 'nizar_gallery'

};
