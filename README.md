# DoorSync

DoorSync is a web app prototype for coordinating classroom unlock requests and professor availability across campus.

This implementation is based on:

- `DoorSync_BRD.docx` for product behavior and role workflows.
- `DoorSync_Database_Design_withERD.xlsx` for entities, relationships, and seed data.

The app is dependency-free and can be hosted as static files.

## Run locally

Open `index.html` in a browser, or serve the folder:

```powershell
python -m http.server 5173
```

Then visit `http://localhost:5173`.

## Included prototype behavior

- Login page with email/password sign-in for student, professor, or personnel accounts from the supplied database seed data.
- Student view for all classroom lock status and all professor availability.
- Professor view for availability updates and room unlock requests.
- Personnel view for pending requests, room details, completed requests, and locking rooms again after use.
- Local persistence through `localStorage`.
- Seed data matching the supplied database workbook.

Note: the supplied workbook has role/entity records and email addresses but no password or credential table, so this prototype uses `doorsync123` as the demo password for every seeded account.

## Demo credentials

All demo accounts use this password:

`doorsync123`

### Students

- Juan Dela Cruz: `juan.delacruz@nu-baliwag.edu.ph`
- Maria Santos: `maria.santos@nu-baliwag.edu.ph`
- Angelo Reyes: `angelo.reyes@nu-baliwag.edu.ph`
- Kristine Bautista: `kristine.bautista@nu-baliwag.edu.ph`

### Professors

- Dr. Ramon Cruz: `ramon.cruz@nu-baliwag.edu.ph`
- Prof. Liza Fernandez: `liza.fernandez@nu-baliwag.edu.ph`
- Dr. Michael Torres: `michael.torres@nu-baliwag.edu.ph`

### Personnel

- Rico Manalo: `rico.manalo@nu-baliwag.edu.ph`
- Ella Ramos: `ella.ramos@nu-baliwag.edu.ph`
