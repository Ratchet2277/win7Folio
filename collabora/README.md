# Collabora Online local

Le service Compose construit une image locale `win7folio-collabora` à partir
de `collabora/code`. Il démarre automatiquement avec le portfolio :

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Le service `documents` est son hôte WOPI en lecture seule. Seul cet hôte
(`http://documents:3000`) est autorisé par `aliasgroup1`. Le navigateur accède à
Collabora à travers les proxys Vite ou Nginx (`/browser`, `/hosting`, `/cool`).
Le HTTP interne est utilisé entre les conteneurs ; en déploiement HTTPS, le
terminateur TLS doit aussi transmettre les WebSockets vers le portfolio.

Les sessions durent une heure. Une session ouverte avant le redémarrage de
`documents` doit être rouverte, car les jetons sont signés avec une clé éphémère.
Les dossiers `public/documents/` et `src/C:/User/Document/` sont montés en lecture
seule dans l’hôte WOPI. Le second est désigné par les chemins `/user-documents/`.
