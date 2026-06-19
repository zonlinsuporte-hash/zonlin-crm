# Configuración del CRM Zonlin Dominicana SRL

Tienes 3 archivos:

- **index.html** — la aplicación (formulario + panel de clientes). Es el archivo que abres en el navegador.
- **Code.gs** — el código que conecta la app con tu Google Sheet (hace de "base de datos").
- **SETUP.md** — esta guía.

La app no tiene servidor propio: usa **Google Apps Script** como puente gratuito hacia tu Google Sheet. Configúralo una sola vez (5–10 minutos).

## Paso 1 — Crear la Google Sheet

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
2. Ponle un nombre, por ejemplo **"Zonlin CRM"**.
3. No necesitas crear columnas: el sistema las crea solas la primera vez que se use.

## Paso 2 — Pegar el código del backend

1. En la hoja, ve a **Extensiones > Apps Script**.
2. Borra todo el contenido que aparece por defecto en `Code.gs`.
3. Abre el archivo **Code.gs** que te entregué, copia todo su contenido y pégalo ahí.
4. Guarda con el ícono de disquete (o Ctrl+S).

## Paso 3 — Publicar como aplicación web

1. Arriba a la derecha, haz clic en **Implementar > Nueva implementación**.
2. En "Selecciona el tipo", elige **Aplicación web**.
3. Configura:
   - **Ejecutar como:** Yo (tu cuenta de Google)
   - **Quién tiene acceso:** Cualquier usuario
4. Haz clic en **Implementar**.
5. Google te pedirá autorizar permisos (es tu propio script accediendo a tu propia hoja) — acepta.
6. Copia la **URL de la aplicación web** que te muestra (empieza con `https://script.google.com/macros/s/.../exec`).

## Paso 4 — Conectar la app con tu hoja

1. Abre **index.html** con cualquier editor de texto (Notepad, VS Code, etc.).
2. Busca esta línea cerca del final del archivo:
   ```js
   const CONFIG = {
     API_URL: 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT'
   };
   ```
3. Reemplaza el texto entre comillas con la URL que copiaste en el paso anterior.
4. Guarda el archivo.

## Paso 5 — Usar el sistema

- Abre **index.html** haciendo doble clic (se abre en tu navegador).
- Pestaña **"Nuevo Cliente"**: registra solicitudes de servicio.
- Pestaña **"Clientes Registrados"**: ve, busca, filtra y edita (clic en una fila) los clientes guardados — los datos viven en tu Google Sheet.

## Paso 6 — IMPORTANTE: actualizar tu Apps Script con la versión protegida por token

Como vas a publicar `index.html` en GitHub (público), agregamos un **token secreto** para que nadie más pueda leer ni escribir clientes con la URL, aunque la vea en el código fuente.

1. Vuelve a **Extensiones > Apps Script** en tu Google Sheet.
2. Borra todo `Code.gs` y pega de nuevo el contenido del `Code.gs` actualizado que te entregué (ya incluye `SECRET_TOKEN`).
3. Guarda (Ctrl+S).
4. Ve a **Implementar > Gestionar implementaciones**, haz clic en el ícono de lápiz (editar) de tu implementación activa, y en "Versión" elige **Nueva versión** > **Implementar**. (La URL no cambia, solo se actualiza el código.)
5. El `index.html` que te entregué ya tiene `CONFIG.TOKEN` con el mismo valor — no necesitas hacer nada más aquí.
6. Si algún día sospechas que el token se filtró, cambia el valor de `SECRET_TOKEN` en `Code.gs` y de `CONFIG.TOKEN` en `index.html` (deben quedar idénticos) y repite el paso 4.

## Notas importantes

- **Precios de planes**: los valores que se autocompletan (7 Mbps = RD$700, etc.) son solo sugerencias de ejemplo. Cámbialos directamente en el formulario de `index.html` (busca `PLAN_PRICES` en el código) para que coincidan con tus tarifas reales.
- **ID Cliente**: se genera automáticamente como `ZON-0001`, `ZON-0002`, etc., según el orden de registro.
- **Cada vez que actualices Code.gs**, debes hacer **Implementar > Gestionar implementaciones > editar (lápiz) > Nueva versión > Implementar** para que los cambios surtan efecto (la URL no cambia).
- Si quieres que varias personas usen el sistema al mismo tiempo desde distintas computadoras, simplemente comparte el archivo `index.html` ya configurado (con la URL pegada) — todos escribirán a la misma hoja.
- Si ves el aviso amarillo de "conecta tu Google Sheet" dentro de la app, significa que el Paso 4 no se completó o la URL está mal pegada.
