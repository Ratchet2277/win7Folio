# doom-wasm

Place the compiled Doom WASM distribution in `public/`. The folder is served
by its own Nginx container on `http://localhost:8080` and is opened by the
Windows 7 `.webapp` entry in the portfolio.

Keep the generated distribution (and any large game data files) out of Git if
they are supplied separately. The placeholder page makes the Compose stack
usable before the port is installed.
