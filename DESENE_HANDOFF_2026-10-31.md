# Concurs de desene „Crăciunul, desenat de cei mici. Ediția I, 2026” — handoff

Data: 31.10.2026. Nu e deployat, nu e commitat. Denis face deploy.

## Rute

| Rută | Cine | Ce face |
|---|---|---|
| `/desen` | public, RO/HU/EN din switch-ul existent | Părintele înscrie desenul: nume părinte, telefon, prenume copil, vârstă (3-14, categoria 3-5 / 6-9 / 10-14 se derivă automat), cafeneaua (Rogerius / ERA / Palatul Copiilor), acordurile. Primește codul (R-001 / E-001 / P-001), instrucțiunile și linkul la foaia de desen. Nu se creează membru sau card. |
| `/desen/foaie.pdf` | public | Foaia de desen. ACUM e un fișier provizoriu (`public/desen/foaie.pdf`, fără diacritice). Se înlocuiește cu PDF-ul de la design, același nume de fișier. |
| `/admin/desene` | orice angajat logat | Lista înscrierilor de la cafeneaua lui (managerul vede tot, cu filtru). Căutare după cod, contoare per cafenea și per categorie, acțiuni: depus / expus / selectat (doar manager, doar cu acord de reproducere) / returnat. Numele părinților și telefoanele NU apar aici. |
| `/admin/desene/nou` | orice angajat logat | Același formular, completat de baristă în cafenea, cu cafeneaua preselectată. După salvare: codul la 48px + buton „Printează eticheta”. |
| `POST /admin/desene/export` | doar manager | CSV (BOM, `;`, CRLF) cu toate înscrierile, inclusiv părinte și telefon. Se notează în jurnal. |
| `/regulament#desen`, `/confidentialitate#desen` | public | Secțiuni placeholder: „se publică după validarea juridică”. Textele finale se pun în `src/app/regulament/page.tsx` și `src/app/confidentialitate/page.tsx`, secțiunea cu `id: "desen"`. |

Tab-ul „Desene” apare în bara de admin pentru manager; baristele primesc un rând cu două tab-uri (Scanare, Desene) ca să ajungă la listă.

## Migrare

Fișier nou: `supabase/migrations/0002_drawing_entries.sql`. Se rulează după `0001_init.sql`.

- tabel `drawing_entries` (index unic pe `code`)
- tabel `drawing_code_sequences` + funcția `next_drawing_code(location)` — codul următor se ia atomic, pe tranzacție
- RLS activat pe ambele (fail closed, ca la restul)

Atenție: adaptorul Supabase (`src/lib/db/supabase.ts`) NU există încă în proiect. Metodele noi din interfața `Db` (`createDrawingEntry`, `getDrawingEntry`, `findDrawingEntryByCode`, `listDrawingEntries`, `setDrawingStatus`, `deleteDrawingEntries`) sunt implementate doar în adaptorul memory. Când se scrie adaptorul Supabase, `createDrawingEntry` apelează `next_drawing_code()` în aceeași tranzacție cu insert-ul.

## Env

Nimic nou. Confirmarea în doi pași la ștergere folosește `ADMIN_SESSION_SECRET` (deja obligatoriu în producție). Rate limit pe `/desen`: 10 înscrieri / oră / IP, în memorie, citit din `x-forwarded-for`.

## Retenție și ștergere

Datele campaniei se păstrează până pe 31.01.2027. După această dată managerul intră în `/admin/desene`, jos, „Șterge datele campaniei”: prima apăsare arată câte înscrieri se șterg, a doua șterge definitiv. Se șterg toate înscrierile (nume părinți, telefoane, prenume copii). Jurnalul păstrează acțiunile, dar rândurile care pointau la un desen sunt redactate (fără cod). Secvențele de coduri repornesc de la 001.

Dacă se apasă înainte de 31.01.2027, butonul avertizează că e mai devreme, dar permite ștergerea.

## Jurnal

Toate intră în jurnal fără nume și fără telefon: `desene.inscriere` (înscriere în cafenea), `desene.status`, `desene.export`, `desene.stergere`. Rezumatele conțin doar codul și cafeneaua.

## Notă despre locații

`src/lib/data.ts` încă are slug-ul `gara` cu numele „Gara Mare”; a patra cafenea este Palatul Copiilor (Roland, 18.09.2026). Un telefon logat la `gara` preselectează „Palatul Copiilor” în concurs (`src/lib/drawing.ts`, `CONTEST_LOCATIONS`). Când se redenumește locația în `data.ts`, se actualizează și `staffSlugs` acolo.

## Teste

`tests/desene.test.mjs`: secvențe per locație, categorii la limite (5/6, 9/10, 2 și 15 refuzate), eligibilitate fără acord de reproducere, tranziții de stare, export cu telefon vs listă fără telefon, ștergere + redactare jurnal, rate limiter.

## Adăugat 10.11.2026: galeria online și votul public

Rute noi: `/desene`, `/desene/[code]`, `/admin/desene/[id]`, `/admin/desene/voturi` și exporturile lor. Migrare nouă: `supabase/migrations/0003_drawing_gallery_votes.sql`. Variabile de mediu noi: `VOTE_HASH_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, opțional `APP_URL`. Descrierea completă e în `CLIENTI/OriginsCafe/PLATFORMA/HANDOFF_DENIS_2026-08.md`, secțiunea „Concursul de desene: galeria online și votul public”.

Secțiunile de mai sus rămân valabile, cu două diferențe: formularul are o bifă nouă, „galeria online” (`consentGallery`, nebifată implicit), iar ștergerea de la finalul campaniei șterge și fotografiile desenelor și voturile.
