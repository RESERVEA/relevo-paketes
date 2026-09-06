# Relevo Paketes

El servidorcito que lleva los avisos del muro a la pantalla del piloto.
Node normal y corriente, sin nada propietario. Vale para Render, Railway,
Fly, un VPS, o el portátil de casa.

## Archivos

- `server.js` — el servidor entero
- `package.json` — dice que hace falta la librería `ws` y cómo arrancarlo

## Subirlo a Render (sin tocar la línea de comandos)

1. Sube estos dos archivos a un repositorio de GitHub, arrastrándolos
   desde la propia web de GitHub.
2. En render.com, New → Web Service → conecta ese repositorio.
3. Build Command: `npm install` · Start Command: `npm start`
4. Instance Type: Free.

Render te da una dirección tipo `https://relevo-paketes.onrender.com`.

## Comprobar que vive

Abre en el navegador `https://TU-DIRECCION/sala/206/estado`. Tiene que
responder con un texto que diga cuántos pilotos y cuántos muros hay.

## Direcciones

- `wss://TU-DIRECCION/sala/<dorsal>?rol=muro` — la consola
- `wss://TU-DIRECCION/sala/<dorsal>?rol=piloto&nombre=<piloto>` — el móvil
- `POST https://TU-DIRECCION/sala/<dorsal>/enviar` — mandar sin WebSocket
- `GET  https://TU-DIRECCION/sala/<dorsal>/estado` — quién hay conectado

## Aviso del plan gratuito de Render

Si nadie se conecta durante 15 minutos, el servicio se duerme y tarda
alrededor de un minuto en despertar. Mientras haya una pantalla conectada
no se duerme. Para las 30 Horas conviene conectarse 5 minutos antes, o
pagar los 7 dólares del mes para que no se duerma nunca.
