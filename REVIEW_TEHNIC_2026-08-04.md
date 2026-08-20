# Review tehnic Origins Platform · 04.08.2026

## Verdict după remedieri

Logica demo este coerentă, build-ul este curat, iar defectele care puteau fi rezolvate fără infrastructura externă au fost remediate. Platforma rămâne **pre-producție**: datele sunt încă ținute în memorie, Wallet nu este conectat, iar autentificarea temporară cu PIN trebuie înlocuită cu Supabase Auth înainte de folosirea cu date reale.

## Verificări finale

- `npm test`: **42/42 teste trecute**.
- `npm run lint`: fără erori.
- `npm run build`: build Next.js 16 + TypeScript reușit.
- Smoke test pe build-ul de producție: `/`, `/era`, `/card`, `/regulament`, `/confidentialitate` și `/admin` răspund cu `200`.
- `/admin/meniu` fără sesiune răspunde cu `307` spre `/admin`.
- Cookie-ul JSON nesemnat care permitea falsificarea rolului de manager este respins cu `307` spre `/admin`.

## Remedieri aplicate

### Securitate admin

- Cookie-ul de tură este acum semnat HMAC-SHA256, expiră după 12 ore și este `httpOnly`, `sameSite=lax`, `secure` în producție.
- Rolul, locația și utilizatorul personal sunt reverificate prin adaptorul de date la fiecare cerere.
- Un `staffId` de barista nu mai poate fi acceptat cu rol de manager.
- PIN-urile implicite `0000`/`1111` există doar în development; producția eșuează închis dacă lipsesc secretele.
- Codurile personale generate evită valorile reale din `ADMIN_DEV_PIN` și `ADMIN_MANAGER_PIN`.
- Au fost adăugate teste pentru semnătură, alterarea tokenului, expirare și escaladarea rolului.

### Reguli, consimțământ și Gold

- Promisiunea neimplementată privind recompensa de ziua de naștere a fost eliminată din textele publice și din comentariile schemei.
- Data nașterii este explicată doar prin scopul implementat: verificarea vârstei și regulile pentru minori.
- Consimțământul promoțional Wallet este opțional și separat de acceptarea regulamentului/politicii; momentul și versiunea sunt păstrate distinct.
- Regulamentul descrie calificarea Gold, expirarea după 14 zile și recalificarea.
- Versiunea consimțământului a fost actualizată la `2026-08-04`.
- UI-ul arată data **și ora** exactă de expirare Gold.

### Admin, meniu și stabilitate UI

- Managerul poate edita numele RO/HU, descrierile RO/HU, categoria și flag-ul de alcool al produsului.
- Un singur produs poate fi eroul sezonier; un produs ascuns nu poate rămâne sezonier.
- Editarea păstrează asocierile cu locațiile aflate temporar în starea „în curând”.
- Prețul `0` este respins; `0` rămâne valid numai pentru numărul de recenzii.
- Google Place ID poate fi corectat din admin și generează linkul de recenzie.
- Metadata locațiilor este citită din adaptorul de date, inclusiv pentru locațiile create ulterior.
- Erorile de rețea nu mai blochează permanent scannerul sau composerul push.
- Fluxurile de cameră sosite după oprire/demontare sunt închise.
- Numele lungi sunt limitate vizual pe card.
- CTA-ul public spune corect „Creează cardul” cât timp Wallet nu este disponibil.

### Schema Supabase

- Au fost adăugate câmpurile EN și imaginile lipsă, consimțământul promoțional și cheia externă pentru verificarea studentului.
- Prețurile și ratingurile au constrângeri; produsul nu poate avea simultan `price` și `price_from`.
- Bonusul de recenzie are index unic per membru.
- RLS este activat pe toate tabelele și schema eșuează închis până la definirea politicilor adaptorului real.

## Blocante externe înainte de lansare

1. **Adaptor Supabase persistent.** `getDb()` folosește încă `memory.ts`; datele se pierd la restart și diferă între instanțe serverless.
2. **Supabase Auth + politici RLS.** Sesiunea semnată repară falsificarea cookie-ului, dar PIN-ul de patru cifre nu este autentificare potrivită pentru producție și nu are rate limiting distribuit.
3. **RPC-uri tranzacționale.** Verificarea și inserarea ștampilei, predarea recompensei, bonusul unic și alegerea produsului sezonier trebuie făcute atomic în PostgreSQL, cu teste de concurență.
4. **Wallet real.** Apple PassKit/Google Wallet, actualizarea pass-urilor și filtrarea push-urilor promoționale numai la membrii cu opt-in sunt încă faza următoare.
5. **GDPR operațional.** Retragerea consimțământului, ștergerea/exportul datelor și retenția de 24 de luni trebuie implementate în adaptor/joburi și validate juridic înainte de colectarea datelor reale.
6. **Testare pe dispozitive.** Scannerul trebuie verificat pe minimum un iPhone Safari și un Android Chrome, apoi fluxul complet pe două telefoane și două cereri concurente.

## Notă rămasă

`reviewIntentAt` există în model, dar linkul public spre Google nu este asociat unui membru. Bonusul este acordat manual de baristă și protejat contra dublării. În implementarea Supabase trebuie decis fie un endpoint intermediar autenticat care marchează intenția, fie eliminarea câmpului dacă verificarea rămâne exclusiv la casă.
