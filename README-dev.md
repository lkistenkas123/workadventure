# The Everywhere Office — lokale ontwikkelomgeving

Deze map bevat een lokale, geïsoleerde kopie van The Everywhere Office. De
WorkAdventure-code staat op dezelfde commit als productie (`a65679fd6`), maar
de containers, volumes, auth-database en configuratie zijn lokaal.

De stack hergebruikt een bestaande lokale Docker/Traefik-installatie. Er wordt
daarom geen tweede reverse proxy gestart en er worden geen extra hostpoorten
80 of 443 geclaimd.

## Git-model

- `master` is de productie-/deploybranch van de eigen WorkAdventure-fork;
- `teo-dev` is de integratiebranch voor lokaal ontwikkelen, upstream-merges en
  acceptatietests;
- `upstream` verwijst naar de officiële WorkAdventure-repository;
- `origin` verwijst naar `lkistenkas123/workadventure`;
- `auth/` is bewust een aparte clone van een private auth-repository, eveneens
  met een eigen `teo-dev`-branch;
- machine- en productiegegevens staan uitsluitend in het genegeerde
  `dev/local.env` en in de private operations-runbook.

Wijzigingen gaan eerst naar `teo-dev`. Pas nadat de volledige lokale omgeving
werkt, wordt `teo-dev` naar `master` gemerged. Het productie-Compose-bestand
blijft ongewijzigd; alle laptop-specifieke instellingen staan in
`docker-compose.dev.yaml`.

## Adressen

- Applicatie: <https://teo.docker>
- Auth: <https://auth.teo.docker/login>
- Productiemap in dev: <https://teo.docker/~/office/the-everywhere-office.wam>

HTTP-verkeer naar `teo.docker` wordt permanent naar HTTPS doorgestuurd.
Traefik vraagt certificaten aan bij de bestaande lokale ontwikkel-CA.

## Vereisten

De volgende lokale onderdelen moeten al draaien:

- Docker Desktop;
- een Traefik-container;
- een extern Docker-netwerk voor de proxy;
- een volume met de lokale CA-certificaten;
- de lokale Development Certificate Authority in de macOS/browser trust store.

De concrete namen worden via `dev/local.env` ingesteld en door
`dev/bootstrap.sh` gecontroleerd.

## Nieuwe laptop opzetten

Start eerst de bestaande lokale Traefik-stack en voer daarna uit:

```sh
git clone --branch teo-dev https://github.com/lkistenkas123/workadventure.git teo-dev
cd teo-dev
cp dev/local.env.example dev/local.env
# Vul dev/local.env met de waarden uit de private operations-runbook.
./dev/bootstrap.sh
./dev/up.sh
./dev/sync-map-from-production.sh
./dev/check.sh
```

`bootstrap.sh` leest de private instellingen uit `dev/local.env`, voegt de
officiële WorkAdventure-repository als `upstream` toe, clonet de aparte
auth-repository en maakt ontbrekende lokale `.env.dev`-bestanden aan vanuit de
commitbare voorbeelden. Bestaande env-bestanden worden niet overschreven.

## Starten

De korte route is:

```sh
./dev/up.sh
```

Onderliggend wordt het volgende Compose-commando gebruikt:

```sh
set -a
. dev/local.env
set +a
cd contrib/docker
docker compose --project-name teo-dev --env-file .env.dev \
  -f docker-compose.yaml -f docker-compose.dev.yaml up -d --build
```

Status controleren:

```sh
docker compose --project-name teo-dev --env-file .env.dev \
  -f docker-compose.yaml -f docker-compose.dev.yaml ps
```

## Stoppen

```sh
./dev/down.sh
```

Gebruik `down -v` alleen wanneer de lokale Redis-data, auth-database en
map-storage bewust verwijderd mogen worden. De gekopieerde kantoormap staat
in het lokale map-storage-volume en moet na `down -v` opnieuw worden
geïmporteerd.

## Lokale authenticatie

Anonieme toegang staat uit (`DISABLE_ANONYMOUS=true`). WorkAdventure gebruikt
de lokale OpenID-provider op `auth.teo.docker`.

De `play`-container moet die publieke hostname ook intern kunnen bereiken.
Daarvoor doet `docker-compose.dev.yaml` twee dingen:

1. `auth.teo.docker` wordt via `host-gateway` naar de lokale Traefik geleid;
2. het geconfigureerde lokale CA-volume wordt read-only gemount en via
   `NODE_EXTRA_CA_CERTS` door Node vertrouwd.

In dev is `RESEND_API_KEY` leeg. Er wordt dus geen echte e-mail verstuurd. Na
het invullen van een e-mailadres staat de magic link in:

```sh
docker logs teo-dev-auth
```

De lokale auth-database staat in het volume `teo-dev_teo-auth-data` en bevat
geen productieaccounts.

## Productiemap in dev

De standaardroom is dezelfde als in productie:

```text
/~/office/the-everywhere-office.wam
```

De mapbestanden zijn een eenmalige kopie uit de geconfigureerde
productiecontainer. Ze staan lokaal in het map-storage-volume van het
Compose-project. Wijzigingen in dev worden niet naar productie teruggeschreven.

Map-storage gebruikt `USE_DOMAIN_NAME_IN_PATH=false`, gelijk aan de bestaande
productiestructuur. Daardoor is de WAM publiek lokaal bereikbaar via:

```text
https://teo.docker/map-storage/office/the-everywhere-office.wam
```

Opnieuw synchroniseren gaat met:

```sh
./dev/sync-map-from-production.sh
```

Het script streamt `/maps/office` via SSH uit de productiecontainer en kopieert
die naar `teo-dev-map-storage-1:/maps/office`. Behandel dit altijd als
eenrichtingssynchronisatie: productie naar dev.

## Upstream bijwerken en naar productie promoveren

Werk altijd vanaf een schone `teo-dev`-branch:

```sh
git switch teo-dev
git fetch upstream
git merge upstream/master
./dev/up.sh
./dev/check.sh
```

Los eventuele mergeconflicten op de dev-branch op en test daar alle relevante
flows. Push daarna eerst alleen de geteste integratiebranch:

```sh
git push origin teo-dev
```

Wanneer de lokale acceptatietest geslaagd is, kan dezelfde wijziging naar de
productiebranch:

```sh
git switch master
git pull --ff-only origin master
git merge --no-ff teo-dev
git push origin master
git switch teo-dev
```

De auth-repository volgt hetzelfde model apart vanuit `auth/`. Merge een
auth-wijziging pas naar diens `main` nadat de combinatie van beide `teo-dev`-
branches lokaal is getest.

## Lokale afwijkingen van productie

- Domeinen zijn `teo.docker` en `auth.teo.docker`.
- De WorkAdventure reverse-proxy en Coturn-services hebben profiel
  `production` en starten lokaal niet.
- Alle publieke services gebruiken het bestaande externe netwerk `proxy`.
- Traefik-entrypoints zijn lokaal `http` en `https`; de lokale
  certificaatresolver wordt via `dev/local.env` ingesteld.
- De applicatierouter dwingt HTTP naar HTTPS, zodat map-URLs niet als HTTP
  worden opgebouwd en CORS-fouten veroorzaken.
- `ADMIN_API_URL` is leeg; de lokale implementaties worden gebruikt.
- Matrix, LiveKit, Jitsi, S3, chat-upload, Sentry en externe integraties staan
  uit zolang daar geen lokale diensten voor zijn ingericht.
- `MatrixProvider` voert zijn startup-call alleen uit wanneer alle
  Matrix-variabelen gevuld zijn.
- De lokale auth-server ondersteunt `/logout` en schrijft de magic link naar
  de logs wanneer Resend niet geconfigureerd is.
- De productie-`.env`, productiecredentials en productie-auth-database zijn
  niet gekopieerd.

## Belangrijke bestanden

- `contrib/docker/.env.dev`: lokale WorkAdventure-configuratie;
- `contrib/docker/.env.dev.example`: veilige, commitbare basisconfiguratie;
- `contrib/docker/docker-compose.dev.yaml`: lokale Compose-override en koppeling
  met de bestaande Traefik-stack;
- `contrib/docker/docker-compose.yaml`: productieconfiguratie; lokaal niet
  aanpassen voor laptop-specifieke instellingen;
- `auth/.env.dev`: lokale auth-configuratie;
- `auth/.env.dev.example`: commitbare auth-basisconfiguratie;
- `auth/server.js`: lokale auth-aanpassingen;
- `play/src/pusher/services/MatrixProvider.ts`: guard voor uitgeschakelde
  Matrix-configuratie.
- `dev/`: bootstrap-, beheer-, controle- en mapsynchronisatiescripts.
- `dev/local.env.example`: publiek sjabloon voor machinegebonden instellingen;
- `dev/local.env`: genegeerde, concrete machine- en productie-instellingen.

## Snelle controles

Certificaten en routes:

```sh
curl -I https://teo.docker
curl -I https://auth.teo.docker/login
curl -I http://teo.docker
```

De laatste opdracht hoort een permanente redirect (`301`) met
`Location: https://teo.docker/` te geven.

Map en OpenID:

```sh
curl https://teo.docker/map-storage/office/the-everywhere-office.wam
curl https://auth.teo.docker/.well-known/openid-configuration
```

Logs:

```sh
docker logs --tail 100 teo-dev-play-1
docker logs --tail 100 teo-dev-auth
# Gebruik voor Traefik de containernaam uit dev/local.env.
```

## Bekende foutbeelden

### Leeg donkerblauw scherm en `ERR_CERT_AUTHORITY_INVALID`

Traefik serveert dan waarschijnlijk zijn default-certificaat. Controleer de
geconfigureerde certificaatresolver en of de lokale CA wordt vertrouwd.

### CORS-fout op `map?playUri=http://teo.docker/...`

De pagina is via HTTP geopend. De lokale router hoort dit automatisch naar
HTTPS om te leiden. Controleer de middleware `teo-dev-https-redirect` op de
`play`-router.

### `Internal Server Error` op `/login-screen`

Controleer `docker logs teo-dev-play-1`. Een fout naar `127.0.0.1:443` betekent
dat de interne `auth.teo.docker` hostgateway niet actief is. Controleer ook het
geconfigureerde CA-volume en `NODE_EXTRA_CA_CERTS`.

### Map geeft 404

Controleer of `/maps/office/the-everywhere-office.wam` in
`teo-dev-map-storage-1` bestaat en of `USE_DOMAIN_NAME_IN_PATH=false` staat.

## Veiligheidsgrenzen

- Gebruik uitsluitend lokale development-secrets in `.env.dev` en
  `auth/.env.dev`.
- Beide `.env.dev`-bestanden en de volledige geneste `auth/`-clone worden door
  de bovenliggende repository genegeerd.
- Koppel dev nooit aan de productie-auth-database of productievolumes.
- Synchroniseer mapdata alleen van productie naar dev.
- Voer geen `docker compose down -v` uit als de lokale map- of auth-data nog
  nodig is.
