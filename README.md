<div align="center">
  <a href="https://nainemom.github.io/win7" target="_blank">
    <img src="https://raw.githubusercontent.com/nainemom/win7/master/public/favicon.ico" height="150"/>
    <h1><b> Microsoft Windows 7 Preview on Web </b></h1>
  </a>
  <p>Yet another OS preview via web technologies focused on Microsoft Windows 7.<p>
  <hr />
  <img src="https://raw.githubusercontent.com/nainemom/win7/master/screen-record.gif" height="281"/>
</div>

## Setup
```bash
git clone https://github.com/nainemom/win7.git # clone the repo
cd win7 # go to repo directory
npm i # install project dependencies
npm run dev # start the app on your browser + hot reload
```

## Développement avec Docker

Le stack local lance le portfolio Vite sur `http://localhost:5173` et le
conteneur réservé à Doom WASM sur `http://localhost:8080` :

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Le projet est monté dans le conteneur du portfolio, donc Vite conserve son
live reload. Le serveur écoute sur le port fixe `5173`.

Dans WebStorm, sélectionnez la configuration partagée **Portfolio Dev** dans
le menu d’exécution, puis cliquez sur Run. Elle lance les deux fichiers Compose
avec `--build`. Le plugin Docker doit être activé et une connexion Docker nommée
`Docker` configurée dans Settings → Build, Execution, Deployment → Docker.
Ouvrez ensuite `http://localhost:5173`.

Collabora et le service de documents WOPI démarrent avec cette même configuration.
Le premier lancement télécharge l’image Collabora et peut prendre un moment.

## Production

Le build est servi par Nginx sur `http://localhost:8081` :

```bash
docker compose -f compose.yaml -f compose.prod.yaml up --build -d
```

Les fichiers de l’application Doom compilée doivent être déposés dans
`doom-wasm/public/`.

## Documents et CV

Déposez les documents dans `public/documents/` (sous-dossiers possibles). Ils
apparaissent dans le dossier « Documents » du bureau Windows. Un double-clic
ouvre une fenêtre Collabora en lecture seule, comme les applications `.webapp`.
Les noms contenant des espaces et des accents sont pris en charge.

Les formats associés sont DOC/DOCX/DOCM/DOT/DOTX, ODT/OTT/RTF,
PPT/PPTX/PPS/PPSX/POT/POTX/ODP/OTP, XLS/XLSX/ODS/OTS/CSV et PDF.
Leur disponibilité effective dépend des formats annoncés par la version de
Collabora installée. Les fichiers publics sont indexés au démarrage et au build ;
en dev, les ajouts et suppressions déclenchent un rechargement du bureau.

Le raccourci CV utilise `CV.webapp` et pointe actuellement vers
`src/C:/User/Document/CV V2.docx`. Ce dossier est également associé à Collabora
et accessible depuis « Documents » dans le menu Démarrer. Pour modifier le CV,
changez son champ `document` :

```json
{
  "icon": "C:/Windows/system/icons/docx.png",
  "document": "/user-documents/CV V2.docx",
  "width": 900,
  "height": 700
}
```

Le service `documents` fournit à Collabora les métadonnées et le contenu via
WOPI. Chaque session utilise un jeton signé valable une heure et lié au fichier.
Les écritures sont refusées ; `public/documents` et `src/C:/User/Document`
sont montés en lecture seule. Les documents de ces deux dossiers sont accessibles
aux visiteurs du portfolio.

Le navigateur utilise les routes du portfolio pour accéder à Collabora,
y compris les WebSockets ; aucun nom de service Docker n’est requis côté client.
Vite gère ces proxys en dev, Nginx en production. Le service WOPI reste interne
au réseau Docker. Hors Docker, configurez des hôtes `documents` et `collabora`
joignables par Vite pour utiliser la visionneuse.

Pour vérifier les permissions WOPI et le transfert des documents :

```bash
npm run test:documents
```

## Contributing
Pull requests are welcome! Checkout the [Issues](https://github.com/nainemom/win7/issues) tab to find `good first issue` labeled issues. Also for manual major changes, please open an issue first to discuss what you would like to change.

Please make sure to run `npm run lint` command before sending your PR!

## License
[Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/)
