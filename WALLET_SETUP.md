# Wallet: cum se actualizează cardul

Două platforme, două mecanisme opuse.

**Apple** nu primește datele, ci doar un semnal. Serverul trimite un push gol prin
APNs către fiecare telefon înregistrat; telefonul răspunde chemând web service-ul
nostru și descarcă `.pkpass`-ul întreg. Deci tot ce contează e (a) ca semnalul să
ajungă și (b) ca pass-ul să fie suficient de mic încât descărcarea să reușească.

**Google** ține pass-ul la el. Nu există înregistrare de device și nici certificat
de push: facem `PATCH` pe obiect prin REST API, iar Google propagă la toate
telefoanele care l-au salvat. `notifyPreference: NOTIFY_ON_UPDATE` transformă o
schimbare de `loyaltyPoints.balance` în notificare pe ecranul blocat.

Punctul unic de intrare e `notifyWalletsForMember()` din
[`src/lib/wallet/notify.ts`](src/lib/wallet/notify.ts). E chemat la ștampilă,
la revendicarea recompensei, la blocare/deblocare și la reemiterea serialului.

## Variabile de mediu

| Variabilă | Pentru ce | Fără ea |
|---|---|---|
| `APPLE_CERT_P12_BASE64` | semnarea `.pkpass` + conexiunea APNs | pass-ul nu se instalează, push-ul nu pleacă |
| `APPLE_CERT_PASSWORD` | parola certificatului | idem (implicit `origins2024`) |
| `APPLE_PASS_TYPE_ID` | topic-ul APNs | implicit `pass.ro.originscafe.circle` |
| `APPLE_TEAM_ID` | `teamIdentifier` în pass | implicit `B6WGU5CX63` |
| `NEXT_PUBLIC_APP_URL` | `webServiceURL` din pass | implicit `https://app.originscafe.ro` |
| `GOOGLE_WALLET_ISSUER_ID` | prefixul id-urilor de clasă/obiect | Google sare complet |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` | semnează JWT-ul de salvare **și** token-ul OAuth | idem |
| `GOOGLE_WALLET_PRIVATE_KEY` | idem | idem |
| `CRON_SECRET` | autorizează jobul nocturn | cron-ul răspunde 401 |
| `PASSKIT_ENFORCE_AUTH` | `1` = respinge token PassKit greșit | doar avertizează în log |

## Pași de configurare

Rulează întâi `node scripts/google-wallet-check.mjs`. E read-only și îți spune
exact care e următorul lucru care lipsește, în loc de un cod HTTP.

1. **Google Wallet API activat** pe proiectul Cloud al service account-ului.
   Fără el orice apel REST dă 403, deși autentificarea reușește. *(făcut)*
2. **Service account invitat pe issuer** în Google Pay & Wallet Console →
   Google Wallet API → Users, cu access level „Developer". *(făcut)*
3. **Clasele există.** `node scripts/google-wallet-setup.mjs` le creează sau le
   actualizează. Idempotent, și nu retrimite niciodată la review o clasă deja
   aprobată. *(făcut — cele trei clase sunt `approved`)*
4. **Rulează migrarea** `supabase/migrations/0007_pass_registrations_policies.sql`.
5. **Setează `CRON_SECRET`** în Vercel. Vercel trimite automat
   `Authorization: Bearer $CRON_SECRET` către cron-urile din `vercel.json`.

## ID-urile de obiect: vechi și noi

Cardurile salvate înainte de septembrie 2026 au tier-ul în id
(`<issuer>.<memberId>_circle`). Cele noi folosesc `<issuer>.<memberId>`, ca
trecerea la Gold să nu mai însemne un obiect care n-a fost salvat niciodată.

`resolveObjectIds()` sondează în paralel toate cele patru variante și
actualizează fiecare obiect găsit. Cine a salvat cardul de două ori, înainte și
după schimbare, are două obiecte; nu se poate ști care e pe telefon, deci se
scriu amândouă. `diag?serial=...` arată `allObjectIds` când sunt mai multe.

## Diagnostic

`node scripts/google-wallet-check.mjs` — verifică local, read-only, toată
lanțul de configurare Google și listează clasele cu numărul de carduri salvate.

`GET /api/v1/passes/diag` arată câți membri au un device Apple care ascultă
(`membersWithDevice` față de `membersTotal` — diferența sunt oamenii pentru care
niciun push nu se încearcă), dacă Google e configurat și dacă token-ul OAuth se
obține.

`GET /api/v1/passes/diag?serial=ORIG-XXXX-XXXX` compară, pentru un singur membru,
ce *ar trebui* să arate cardul cu ce ține Google efectiv. Așa se deosebește
„actualizarea nu a plecat" de „omul nu a salvat niciodată cardul".

## Jobul nocturn

`GET /api/v1/passes/refresh` (cron zilnic, 03:00). Există pentru un singur motiv:
pierderea statutului Gold nu e declanșată de nimic — se întâmplă pentru că au
trecut destule zile fără vizită, și nicio cerere nu observă. Fără job, un membru
retrogradat rămâne cu card auriu pe telefon la nesfârșit.

Statutul Gold rămâne derivat, nu stocat. Jobul întreabă pass-ul Google ce arată
acum și îl corectează când nu e de acord; pentru Apple pass-ul se reconstruiește
oricum la fiecare descărcare, deci e destul un semnal.

## Limite de care depinde comportamentul

- **Google: 3 notificări per card per 24h.** La depășire, `notifyGooglePassUpdated`
  reface `PATCH`-ul fără notificare, ca numărul de ștampile să ajungă oricum.
- **Apple: `apns-expiration` la 24h.** Un push expirat imediat e aruncat dacă
  telefonul nu e online chiar atunci, fără reîncercare — de aceea nu mai e 0.
- **Dimensiunea pass-ului.** Cele trei strip-uri se randează la mărimile reale
  (375×123, 750×246, 1125×369) și se cuantizează la paletă. Pass-ul a scăzut de la
  2,4 MB la ~456 KB. Peste ~1 MB, descărcarea de după push începe să eșueze pe
  conexiuni slabe.
