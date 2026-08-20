-- Origins platform — Seed data (mirrors src/lib/data.ts & src/lib/loyalty.ts)
-- Run this in Supabase SQL Editor after 0001_init.sql

-- 1. REWARDS
insert into rewards (id, name_ro, name_hu, name_en, stamps_required, active) values
  ('upgrade', 'Upgrade din partea casei', 'Ajándék upgrade', 'Upgrade on the house', 3, false),
  ('free_coffee', 'Cafea din partea casei', 'Kávé a ház ajándéka', 'Coffee on the house', 5, true),
  ('gold_addon', 'Un extra din partea casei', 'Egy extra a háztól', 'One extra on the house', 0, true),
  ('gold_coffee', 'O cafea în plus din partea casei', 'Egy plusz kávé a háztól', 'An extra coffee on the house', 0, true),
  ('birthday_drink', 'O băutură din partea casei', 'Egy ital a háztól', 'A drink on the house', 0, false)
on conflict (id) do update set
  name_ro = excluded.name_ro,
  name_hu = excluded.name_hu,
  name_en = excluded.name_en,
  stamps_required = excluded.stamps_required,
  active = excluded.active;

-- 2. LOYALTY CONFIG
insert into loyalty_config (id, config) values
  (true, '{
    "cycleLength": 5,
    "midReward": {"enabled": false, "stampsRequired": 3},
    "gold": {
      "enabled": true,
      "cardsRequired": 4,
      "requalifyCards": 1,
      "inactivityDays": 14,
      "warningDays": 3,
      "cycleLength": 4,
      "perks": {
        "enabled": true,
        "periodDays": 14,
        "clock": "shared",
        "anchorDate": "2026-08-03",
        "rotation": ["gold_addon", "gold_coffee"],
        "toGoOnly": true
      }
    },
    "birthday": {"enabled": false, "windowDays": 7},
    "doubleStamp": {"enabled": true, "weekday": 2, "fromHour": 14, "toHour": 17},
    "stampWindowHours": 2,
    "rewardValueCap": null,
    "names": {
      "upgrade": {"ro": "Upgrade din partea casei", "hu": "Ajándék upgrade", "en": "Upgrade on the house"},
      "free_coffee": {"ro": "Cafea din partea casei", "hu": "Kávé a ház ajándéka", "en": "Coffee on the house"},
      "gold_addon": {"ro": "Un extra din partea casei", "hu": "Egy extra a háztól", "en": "One extra on the house"},
      "gold_coffee": {"ro": "O cafea în plus din partea casei", "hu": "Egy plusz kávé a háztól", "en": "An extra coffee on the house"},
      "birthday_drink": {"ro": "O băutură din partea casei", "hu": "Egy ital a háztól", "en": "A drink on the house"}
    },
    "updatedAt": null
  }'::jsonb)
on conflict (id) do update set config = excluded.config;

-- 3. LOCATIONS
insert into locations (slug, name, address_ro, address_hu, address_en, hours_ro, hours_hu, hours_en, coming_soon, seasonal_note_ro, seasonal_note_hu, seasonal_note_en, photo_url, hero_photo_url, google_place_id, google_rating, google_review_count, review_url, wolt_url, serves_alcohol) values
  ('era', 'ERA Shopping Park', 'Calea Aradului 62, Oradea', 'Calea Aradului 62, Nagyvárad', null, 'L-D 09:00 - 21:00', 'H-V 09:00 - 21:00', 'Mon-Sun 09:00 - 21:00', false, null, null, null, '/photos/loc-era.webp', '/photos/hero-era-ddb7862a.webp', 'ChIJpVTBgEVHRkcRnbZALZqcg6c', 4.9, 73, 'https://search.google.com/local/writereview?placeid=ChIJpVTBgEVHRkcRnbZALZqcg6c', null, true),
  ('rogerius', 'Rogerius', 'Calea Corneliu Coposu 33, Oradea', 'Calea Corneliu Coposu 33, Nagyvárad', null, 'L-V 07:00 - 21:00', 'H-P 07:00 - 21:00', 'Mon-Fri 07:00 - 21:00', false, null, null, null, '/photos/loc-rogerius-fdd7caf3.webp', '/photos/hero-rogerius-d1859c6f.webp', 'ChIJr3BDSwdJRkcRSsy_H07WvC4', 4.8, 127, 'https://search.google.com/local/writereview?placeid=ChIJr3BDSwdJRkcRSsy_H07WvC4', null, true),
  ('oraselul', 'Orășelul Copiilor', 'Calea Corneliu Coposu 8, Oradea', 'Calea Corneliu Coposu 8, Nagyvárad', null, null, null, null, false, 'Deschis martie - octombrie', 'Nyitva márciustól októberig', 'Open March - October', '/photos/loc-oraselul-9ff6b6e1.webp', '/photos/hero-oraselul-6f41716b.webp', null, null, null, null, null, false),
  ('gara', 'Gara Mare', 'Strada Muzeului 2, Oradea', 'Strada Muzeului 2, Nagyvárad', null, null, null, null, false, null, null, null, '/photos/loc-gara.webp', '/photos/hero-gara-f8aee5d8.webp', null, null, null, null, null, true),
  ('lazar', 'Aurel Lazăr', 'Strada Aurel Lazăr 21, Oradea', 'Strada Aurel Lazăr 21, Nagyvárad', null, null, null, null, true, null, null, null, null, null, null, null, null, null, null, null)
on conflict (slug) do update set
  name = excluded.name,
  address_ro = excluded.address_ro,
  address_hu = excluded.address_hu,
  hours_ro = excluded.hours_ro,
  hours_hu = excluded.hours_hu,
  hours_en = excluded.hours_en,
  coming_soon = excluded.coming_soon,
  seasonal_note_ro = excluded.seasonal_note_ro,
  seasonal_note_hu = excluded.seasonal_note_hu,
  seasonal_note_en = excluded.seasonal_note_en,
  photo_url = excluded.photo_url,
  hero_photo_url = excluded.hero_photo_url,
  google_place_id = excluded.google_place_id,
  google_rating = excluded.google_rating,
  google_review_count = excluded.google_review_count,
  review_url = excluded.review_url,
  serves_alcohol = excluded.serves_alcohol;

-- 4. CATEGORIES
insert into categories (slug, name_ro, name_hu, name_en, photo_url, sort_order) values
  ('cafea', 'Cafea', 'Kávé', 'Coffee', '/photos/cat-cafea-17d01f26.webp', 1),
  ('patiserie', 'Patiserie', 'Péksütemény', 'Pastries', '/photos/cat-patiserie-76f6bdb8.webp', 2),
  ('inghetata', 'Înghețată', 'Fagylalt', 'Ice cream', '/photos/cat-inghetata-cc2eed30.webp', 3),
  ('piadine', 'Piadine', 'Piadinák', 'Piadinas', '/photos/cat-piadine-809cfd86.webp', 4),
  ('naturale', 'Naturale', 'Frissek & limonádék', 'Fresh juices & lemonades', '/photos/cat-naturale-77096fba.webp', 5),
  ('racoritoare', 'Băuturi răcoritoare', 'Üdítők', 'Soft drinks', '/photos/cat-racoritoare-9e791952.webp', 6),
  ('combo', 'Combo', 'Combo', 'Combo', '/photos/cat-combo-947499e3.webp', 7),
  ('extra', 'Extra', 'Extrák', 'Extras', '/photos/cat-extra-9caf53be.webp', 8),
  ('cocktailuri', 'Cocktailuri', 'Koktélok', 'Cocktails', '/photos/cat-cocktailuri-dded9dff.webp', 9),
  ('aperitive', 'Aperitive', 'Aperitifek', 'Aperitifs', '/photos/cat-aperitive-2e311eec.webp', 10),
  ('bere', 'Bere', 'Sör', 'Beer', '/photos/cat-bere-4323b70a.webp', 11),
  ('bere-draught', 'Bere draught', 'Csapolt sör', 'Draught beer', '/photos/cat-bere-draught-d79434d8.webp', 12),
  ('cidru', 'Cidru', 'Cider', 'Cider', '/photos/cat-cidru-034b1a24.webp', 13),
  ('spirtoase', 'Spirtoase', 'Röviditalok', 'Spirits', '/photos/cat-spirtoase-83c7f654.webp', 14)
on conflict (slug) do update set
  name_ro = excluded.name_ro,
  name_hu = excluded.name_hu,
  name_en = excluded.name_en,
  photo_url = excluded.photo_url,
  sort_order = excluded.sort_order;

-- 5. PRODUCTS
insert into products (id, category_slug, name_ro, name_hu, name_en, description_ro, description_hu, description_en, price, price_from, photo_url, alcohol, seasonal, active, sort_order) values
  ('ristretto', 'cafea', 'Ristretto', null, null, '22 ml', null, null, 9.5, null, null, false, false, true, 1),
  ('espresso', 'cafea', 'Espresso', null, null, '30 ml', null, null, 9.5, null, '/photos/p-espresso-5f08cd61.webp', false, false, true, 2),
  ('espresso-dublu', 'cafea', 'Espresso dublu', 'Dupla espresso', 'Double espresso', '60 ml', null, null, 14, null, '/photos/p-espresso-dublu-733c356b.webp', false, false, true, 3),
  ('americano', 'cafea', 'Americano', null, null, 'espresso, apă fierbinte · 120 ml', 'espresso, forró víz · 120 ml', 'espresso, hot water · 120 ml', 10.5, null, '/photos/p-americano-06940c2b.webp', false, false, true, 4),
  ('cappuccino', 'cafea', 'Cappuccino', null, null, 'espresso, cremă de lapte · 180 ml', 'espresso, tejhab · 180 ml', 'espresso, steamed milk · 180 ml', 14.5, null, '/photos/p-cappuccino-cf36e515.webp', false, false, true, 5),
  ('cappuccino-vienez', 'cafea', 'Cappuccino vienez', 'Bécsi cappuccino', 'Viennese cappuccino', 'espresso, cremă de lapte, frișcă · 180 ml', 'espresso, tejhab, tejszínhab · 180 ml', 'espresso, steamed milk, whipped cream · 180 ml', 17, null, '/photos/p-cappuccino-vienez-74405830.webp', false, false, true, 6),
  ('macchiato', 'cafea', 'Macchiato', null, null, 'espresso, cremă de lapte · 45 ml', 'espresso, tejhab · 45 ml', 'espresso, steamed milk · 45 ml', 11.5, null, '/photos/p-macchiato-f6abdc3b.webp', false, false, true, 7),
  ('flat-white', 'cafea', 'Flat white', null, null, 'espresso dublu, cremă de lapte · 180 ml', 'dupla espresso, tejhab · 180 ml', 'double espresso, steamed milk · 180 ml', 17, null, '/photos/p-flat-white.webp', false, false, true, 8),
  ('latte-macchiato', 'cafea', 'Latte macchiato', null, null, 'cremă de lapte, espresso · 300 ml', 'tejhab, espresso · 300 ml', 'steamed milk, espresso · 300 ml', 16, null, '/photos/p-latte-macchiato-249a2f31.webp', false, false, true, 9),
  ('maxi-latte-macchiato', 'cafea', 'Maxi latte macchiato', null, null, 'cremă de lapte, espresso dublu · 450 ml', 'tejhab, dupla espresso · 450 ml', 'steamed milk, double espresso · 450 ml', 18.5, null, '/photos/p-maxi-latte-macchiato-ec1383df.webp', false, false, true, 10),
  ('ice-coffee', 'cafea', 'Ice coffee', null, null, 'espresso, înghețată, lapte, frișcă lichidă, gheață · 300 ml', 'espresso, fagylalt, tej, tejszín, jég · 300 ml', 'espresso, ice cream, milk, cream, ice · 300 ml', 21, null, '/photos/p-ice-coffee-ea9407c1.webp', false, false, true, 11),
  ('affogato', 'cafea', 'Affogato', null, null, 'espresso, 1 glob de înghețată · 120 ml', 'espresso, 1 gombóc fagylalt · 120 ml', 'espresso, 1 scoop of ice cream · 120 ml', 16, null, '/photos/p-affogato-4d7c80f1.webp', false, false, true, 12),
  ('ceai', 'cafea', 'Ceai', 'Tea', 'Tea', 'diverse sortimente · 300 ml', 'többféle ízben · 300 ml', 'assorted blends · 300 ml', 13.5, null, '/photos/p-ceai-14d76ea8.webp', false, false, true, 13),
  ('ciocolata-calda', 'cafea', 'Ciocolată caldă', 'Forró csokoládé', 'Hot chocolate', '200 ml', null, null, 15, null, '/photos/p-ciocolata-calda-23e26fc6.webp', false, false, true, 14),
  ('croissant', 'patiserie', 'Croissant cu unt', 'Vajas croissant', 'Butter croissant', 'făină, unt, zahăr · 60 g', 'liszt, vaj, cukor · 60 g', 'flour, butter, sugar · 60 g', 7, null, '/photos/p-croissant-78133d3a.webp', false, false, true, 15),
  ('pain-au-chocolat', 'patiserie', 'Pain au chocolat', null, null, 'făină, unt, zahăr, ciocolată · 75 g', 'liszt, vaj, cukor, csokoládé · 75 g', 'flour, butter, sugar, chocolate · 75 g', 8, null, '/photos/p-pain-au-chocolat-75067397.webp', false, false, true, 16),
  ('inghetata-rogerius', 'inghetata', 'Înghețată', 'Fagylalt', 'Ice cream', '13 sortimente la vitrină, din gama de 26', '13 ízesítés a pultban, a 26-os kínálatból', '13 flavours on display, from a range of 26', null, null, '/photos/p-inghetata-c3bcab24.webp', false, false, true, 17),
  ('inghetata-era', 'inghetata', 'Înghețată', 'Fagylalt', 'Ice cream', '8 sortimente la vitrină, din gama de 26', '8 ízesítés a pultban, a 26-os kínálatból', '8 flavours on display, from a range of 26', null, null, '/photos/p-inghetata-c3bcab24.webp', false, false, true, 18),
  ('inghetata-oraselul', 'inghetata', 'Înghețată', 'Fagylalt', 'Ice cream', '16 sortimente la vitrină, din gama de 26', '16 ízesítés a pultban, a 26-os kínálatból', '16 flavours on display, from a range of 26', null, null, '/photos/p-inghetata-c3bcab24.webp', false, false, true, 19),
  ('piadina-clasica', 'piadine', 'Piadina Clasica', null, null, 'lipie, mozzarella, prosciutto crudo, rucola · 220 g', 'lepény, mozzarella, prosciutto crudo, rukkola · 220 g', 'flatbread, mozzarella, prosciutto crudo, rocket · 220 g', 28, null, '/photos/p-piadina-clasica-c200dc7c.webp', false, false, true, 20),
  ('piadina-diavola', 'piadine', 'Piadina Diavola', null, null, 'lipie, salam picant, cremă de brânză, gorgonzola, roșii uscate · 235 g', 'lepény, csípős szalámi, krémsajt, gorgonzola, aszalt paradicsom · 235 g', 'flatbread, spicy salami, cream cheese, gorgonzola, sun-dried tomatoes · 235 g', 26.5, null, '/photos/p-piadina-diavola-96496620.webp', false, false, true, 21),
  ('piadina-cotto-brie', 'piadine', 'Piadina Cotto e Brie', null, null, 'lipie, prosciutto cotto, cremă de brânză, brânză brie · 215 g', 'lepény, prosciutto cotto, krémsajt, brie sajt · 215 g', 'flatbread, prosciutto cotto, cream cheese, brie · 215 g', 25.5, null, '/photos/p-piadina-cotto-brie-4d5dd6ee.webp', false, false, true, 22),
  ('piadina-vegetariana', 'piadine', 'Piadina Vegetariană', 'Vegetáriánus piadina', 'Vegetarian piadina', 'lipie, mozzarella, brie, gorgonzola, ciuperci, rucola · 225 g', 'lepény, mozzarella, brie, gorgonzola, gomba, rukkola · 225 g', 'flatbread, mozzarella, brie, gorgonzola, mushrooms, rocket · 225 g', 25.5, null, '/photos/p-piadina-vegetariana-21e52cf7.webp', false, false, true, 23),
  ('fresh-portocale', 'naturale', 'Fresh portocale', 'Narancs fresh', 'Orange juice', '300 ml', null, null, 17.5, null, '/photos/p-fresh-portocale-ba6b0dc6.webp', false, false, true, 24),
  ('fresh-grapefruit', 'naturale', 'Fresh grapefruit', 'Grapefruit fresh', 'Grapefruit juice', '300 ml', null, null, 17.5, null, '/photos/p-fresh-grapefruit-bca71e0a.webp', false, false, true, 25),
  ('fresh-mixt', 'naturale', 'Fresh mixt', 'Vegyes fresh', 'Mixed juice', '300 ml', null, null, 17.5, null, '/photos/p-fresh-mixt-db12bb2d.webp', false, false, true, 26),
  ('fresh-rodie', 'naturale', 'Fresh rodie', 'Gránátalma fresh', 'Pomegranate juice', '200 ml', null, null, 22, null, '/photos/p-fresh-rodie-b8c8ac03.webp', false, false, true, 27),
  ('limonada', 'naturale', 'Limonadă', 'Limonádé', 'Lemonade', '450 ml', null, null, 16, null, '/photos/p-limonada-31b2f921.webp', false, false, true, 28),
  ('limonada-mango', 'naturale', 'Limonadă cu mango', 'Mangós limonádé', 'Mango lemonade', 'Limonadă cu mango, servită rece · 450 ml', 'Mangós limonádé, hidegen szervírozva · 450 ml', 'Mango lemonade, served cold · 450 ml', 20, null, '/photos/p-limonada-mango-8f130c64.webp', false, true, true, 29),
  ('limonada-fructe-padure', 'naturale', 'Limonadă cu fructe de pădure', 'Erdei gyümölcsös limonádé', 'Forest fruit lemonade', 'Limonadă cu fructe de pădure, servită rece · 450 ml', 'Erdei gyümölcsös limonádé, hidegen szervírozva · 450 ml', 'Forest fruit lemonade, served cold · 450 ml', 20, null, '/photos/p-limonada-fructe-padure-2055d1cb.webp', false, false, true, 30),
  ('limonada-capsuni', 'naturale', 'Limonadă cu căpșuni', 'Epres limonádé', 'Strawberry lemonade', 'Limonadă cu căpșuni, servită rece · 450 ml', 'Epres limonádé, hidegen szervírozva · 450 ml', 'Strawberry lemonade, served cold · 450 ml', 20, null, '/photos/p-limonada-capsuni-a24a14db.webp', false, false, true, 31),
  ('coca-cola', 'racoritoare', 'Coca Cola', null, null, '250 ml', null, null, 11, null, null, false, false, true, 32),
  ('fanta', 'racoritoare', 'Fanta', null, null, '250 ml', null, null, 11, null, null, false, false, true, 33),
  ('sprite', 'racoritoare', 'Sprite', null, null, '250 ml', null, null, 11, null, null, false, false, true, 34),
  ('schweppes', 'racoritoare', 'Schweppes', null, null, '250 ml', null, null, 11, null, null, false, false, true, 35),
  ('dorna-plata', 'racoritoare', 'Dorna apă plată', 'Dorna szénsavmentes víz', 'Dorna still water', '330 ml', null, null, 10, null, null, false, false, true, 36),
  ('dorna-minerala', 'racoritoare', 'Dorna apă minerală', 'Dorna ásványvíz', 'Dorna sparkling water', '330 ml', null, null, 10, null, null, false, false, true, 37),
  ('cappy-portocale', 'racoritoare', 'Cappy portocale', 'Cappy narancs', 'Cappy orange', null, null, null, 12, null, null, false, false, true, 38),
  ('cappy-portocale-rosii', 'racoritoare', 'Cappy portocale roșii', 'Cappy vérnarancs', 'Cappy blood orange', '250 ml', null, null, 12, null, null, false, false, true, 39),
  ('combo-espresso-cola', 'combo', 'Espresso + Cola', null, null, null, null, null, 16, null, null, false, false, true, 40),
  ('combo-espresso-apa', 'combo', 'Espresso + apă', 'Espresso + víz', 'Espresso + water', null, null, null, 16, null, null, false, false, true, 41),
  ('combo-cappuccino-pain', 'combo', 'Cappuccino + pain au chocolat', null, null, null, null, null, 16, null, null, false, false, true, 42),
  ('extra-lapte-vegetal', 'extra', 'Lapte vegetal', 'Növényi tej', 'Plant milk', 'migdale, soia, cocos', 'mandula, szója, kókusz', 'almond, soy, coconut', 4, null, null, false, false, true, 43),
  ('extra-aroma', 'extra', 'Aromă', 'Ízesítés', 'Syrup', 'choco cookie, caramel, caramel sărat, vanilie, migdale, popcorn, pumpkin spice · 10 ml', 'choco cookie, karamell, sós karamell, vanília, mandula, popcorn, pumpkin spice · 10 ml', 'choco cookie, caramel, salted caramel, vanilla, almond, popcorn, pumpkin spice · 10 ml', 3, null, null, false, false, true, 44),
  ('extra-aloe-vera', 'extra', 'Aloe vera', null, null, '10 g', null, null, 3, null, null, false, false, true, 45),
  ('cuba-libre', 'cocktailuri', 'Cuba Libre Cubano', null, null, 'rom, cola, lime, gheață · 250 ml', 'rum, kóla, lime, jég · 250 ml', 'rum, cola, lime, ice · 250 ml', 25, null, '/photos/p-cuba-libre-c828b306.webp', true, false, true, 46),
  ('gin-tonic', 'cocktailuri', 'Gin Tonic', null, null, 'gin, apă tonică, lămâie, gheață · 250 ml', 'gin, tonik, citrom, jég · 250 ml', 'gin, tonic water, lemon, ice · 250 ml', 25, null, '/photos/p-gin-tonic-30f24a9b.webp', true, false, true, 47),
  ('gin-sonic', 'cocktailuri', 'Gin Sonic', null, null, 'gin, apă tonică, lămâie, sirop soc, suc grepfrut, gheață · 250 ml', 'gin, tonik, citrom, bodzaszörp, grapefruitlé, jég · 250 ml', 'gin, tonic water, lemon, elderflower syrup, grapefruit juice, ice · 250 ml', 25, null, '/photos/p-gin-sonic-b0ef13d3.webp', true, false, true, 48),
  ('mojito', 'cocktailuri', 'Mojito', null, null, 'rom, sodă, lime, mentă, gheață · 250 ml', 'rum, szóda, lime, menta, jég · 250 ml', 'rum, soda, lime, mint, ice · 250 ml', 25, null, '/photos/p-mojito-d92d074a.webp', true, false, true, 49),
  ('lemon-ginger-gin', 'cocktailuri', 'Lemon Ginger Gin', null, null, 'gin, suc lămâie, ghimbir, Schweppes bitter lemon, gheață · 250 ml', 'gin, citromlé, gyömbér, Schweppes bitter lemon, jég · 250 ml', 'gin, lemon juice, ginger, Schweppes bitter lemon, ice · 250 ml', 25, null, '/photos/p-lemon-ginger-gin-8bc09970.webp', true, false, true, 50),
  ('aperol-spritz', 'cocktailuri', 'Aperol Spritz', null, null, 'prosecco, Aperol, sodă, gheață · 300 ml', 'prosecco, Aperol, szóda, jég · 300 ml', 'prosecco, Aperol, soda, ice · 300 ml', 25, null, '/photos/p-aperol-spritz-a9ddf703.webp', true, false, true, 51),
  ('hugo', 'cocktailuri', 'Hugo', null, null, 'prosecco, sodă, sirop de soc, lime, mentă, gheață · 300 ml', 'prosecco, szóda, bodzaszörp, lime, menta, jég · 300 ml', 'prosecco, soda, elderflower syrup, lime, mint, ice · 300 ml', 25, null, '/photos/p-hugo-2087c0b6.webp', true, false, true, 52),
  ('daiquiri', 'cocktailuri', 'Daiquiri', null, null, 'rom negru, suc grepfrut, zahăr, grenadine, gheață · 250 ml', 'sötét rum, grapefruitlé, cukor, grenadine, jég · 250 ml', 'dark rum, grapefruit juice, sugar, grenadine, ice · 250 ml', 25, null, null, true, false, true, 53),
  ('prosecco', 'aperitive', 'Prosecco', null, null, '125 ml', null, null, 20, null, null, true, false, true, 54),
  ('prosecco-valdobiaddene', 'aperitive', 'Prosecco Valdobiaddene DOC', null, null, '750 ml', null, null, 95, null, null, true, false, true, 55),
  ('heineken', 'bere', 'Heineken', null, null, '330 ml', null, null, 11.5, null, null, true, false, true, 56),
  ('birra-moretti', 'bere', 'Birra Moretti', null, null, '330 ml', null, null, 11.5, null, null, true, false, true, 57),
  ('ciuc-premium', 'bere', 'Ciuc Premium', null, null, '330 ml', null, null, 10.5, null, null, true, false, true, 58),
  ('heineken-zero', 'bere', 'Heineken 0%', null, null, '330 ml', null, null, 11.5, null, null, true, false, true, 59),
  ('corona', 'bere', 'Corona', null, null, '330 ml', null, null, 16, null, null, true, false, true, 60),
  ('heineken-draught-250', 'bere-draught', 'Heineken', null, null, '250 ml', null, null, 12, null, null, true, false, true, 61),
  ('heineken-draught-400', 'bere-draught', 'Heineken', null, null, '400 ml', null, null, 16, null, null, true, false, true, 62),
  ('strongbow-dry-white', 'cidru', 'Strongbow Dry White', null, null, '330 ml', null, null, 13, null, null, true, false, true, 63),
  ('strongbow-rose', 'cidru', 'Strongbow Rose', null, null, '330 ml', null, null, 13, null, null, true, false, true, 64),
  ('strongbow-gold-apple', 'cidru', 'Strongbow Gold Apple', null, null, '330 ml', null, null, 13, null, null, true, false, true, 65),
  ('jagermeister', 'spirtoase', 'Jägermeister', null, null, '40 ml', null, null, 13.5, null, null, true, false, true, 66),
  ('rom-negru', 'spirtoase', 'Rom negru', 'Sötét rum', 'Dark rum', '40 ml', null, null, 13, null, null, true, false, true, 67),
  ('cognac', 'spirtoase', 'Cognac', null, null, '40 ml', null, null, 14.5, null, null, true, false, true, 68),
  ('vodka-sky', 'spirtoase', 'Vodka Sky', null, null, '40 ml', null, null, 13.5, null, null, true, false, true, 69),
  ('johnnie-walker-black', 'spirtoase', 'Johnnie Walker Black Label', null, null, '40 ml', null, null, 18, null, null, true, false, true, 70),
  ('unicum', 'spirtoase', 'Unicum', null, null, '40 ml', null, null, 14.5, null, null, true, false, true, 71)
on conflict (id) do update set
  category_slug = excluded.category_slug,
  name_ro = excluded.name_ro,
  name_hu = excluded.name_hu,
  name_en = excluded.name_en,
  description_ro = excluded.description_ro,
  description_hu = excluded.description_hu,
  description_en = excluded.description_en,
  price = excluded.price,
  price_from = excluded.price_from,
  photo_url = excluded.photo_url,
  alcohol = excluded.alcohol,
  seasonal = excluded.seasonal,
  active = excluded.active,
  sort_order = excluded.sort_order;

-- 6. PRODUCT AVAILABILITY (only products restricted to specific locations)
insert into product_availability (product_id, location_slug) values
  ('inghetata-rogerius', 'rogerius'),
  ('inghetata-era', 'era'),
  ('inghetata-oraselul', 'oraselul')
on conflict (product_id, location_slug) do nothing;

-- 7. CAMPAIGN FLAGS
insert into campaign_flags (key, enabled) values
  ('student_signup_promo', false)
on conflict (key) do nothing;
