TRADING JOURNAL MOBILE v0.1 — ANDROID TESTIVERSIO

SISÄLTÖ
index.html, app.js, manifest.webmanifest, sw.js: mobiiliverkkosovellus.
import_mobile.py: erillinen Windows SQLite -tuontityökalu.

ANDROID-KÄYTTÖ
PWA:n asennus Androidin aloitusnäytölle vaatii HTTPS-osoitteen. Tiedostojen
kopiointi puhelimeen ei yksin asenna PWA:ta. Julkaise nämä neljä verkkotiedostoa
luotettavassa HTTPS-staattisessa hosting-palvelussa (esim. yksityinen HTTPS-hostaus)
ja avaa index.html Androidin Chromessa. Valitse selaimen valikosta
"Lisää aloitusnäyttöön" / "Asenna sovellus", jos toiminto on tarjolla.
Sovellus ei lähetä treiditietoja palvelimelle: tiedot ovat IndexedDB:ssä
kyseisen verkkosivun originin alla. Sovelluksen tiedostot voivat jäädä
Service Worker -välimuistiin offline-käyttöä varten.

HUOM! Tämä on TESTIVERSIO. Varmuuskopioi Export all trades -toiminnolla
säännöllisesti. Älä käytä selaimen yksityistä tilaa, tyhjennä sivuston tietoja
tai vaihda hosting-osoitetta olettaen tietojen siirtyvän automaattisesti.

WINDOWS-TUONTI (KOKEILU)
1. Ota Trading Journalin tietokannasta varmuuskopio.
2. Vie Androidista JSON-tiedosto ja siirrä se Windows-koneelle.
3. Sulje Windows Trading Journal ennen tuontia.
4. Aja CMD:ssä:
   py -3.15 import_mobile.py --dry-run "C:\polku\TradingJournal_Mobile_2026-11-04.json"
   py -3.15 import_mobile.py "C:\polku\TradingJournal_Mobile_2026-11-04.json"
5. Käynnistä Windows Trading Journal uudelleen.

Tuontityökalu tekee oman SQLite-varmuuskopion ennen muutoksia, säilyttää
UUID-tunnisteet ja ohittaa jo tuodut tunnisteet. Ristiriitaiset avainkentät
pysäyttävät tuonnin. PUUTTUVAN FX-KURSSIN SULKEMISIA EI TUODA. Tämä on
väliaikainen turvallinen rajoitus; täydentämistoiminto tulee myöhemmin.

RAJOITUKSET
- Mobiilissa ei vielä ole treidien muokkausta eikä valuuttakurssin automaattihakua.
- Puhelimen sulkemisille EUR-kurssi ja lähde voidaan syöttää käsin; ne voidaan
  myös jättää puuttumaan, mutta silloin Windows-tuonti jättää sulkemisen odottamaan.
- Ei mobiilin PDF-/Excel-raportteja; raportit tehdään Windowsissa.
- Mobiiliversion tarkkoja toteutusaikoja käsitellään Suomen paikallisaikoina.
- Selaimen tietojen poisto voi poistaa kaikki paikalliset treidit.
- Varmista ennen varsinaista käyttöä, että data ja osittaiset sulkemiset siirtyvät
  oikein testiympäristössä. Tämä ei ole vielä tuotantoversio.
