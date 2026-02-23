# ICCM Mazatlán — Sitio estático + Sermones (YouTube RSS)

Sitio web **100% estático** (HTML/CSS/JS) para **Iglesia Cristiana Congregacional de Mazatlán**, listo para **GitHub Pages**.

## Sermones sin API Key (RSS)

La sección **Sermones** se actualiza automáticamente usando:

- RSS oficial de YouTube del canal (videos):
   `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`
- Conversión RSS → JSON (para evitar problemas de CORS en el navegador):
   `https://api.rss2json.com/v1/api.json?rss_url=`

Esto permite cargar los **6 videos más recientes** sin:
- YouTube Data API
- API keys
- Google Cloud
- Backend / Node / Express

Actualmente el sitio muestra **4**: **1 destacado** ("Último mensaje") + **3** en "Más mensajes".

## Configuración del canal

Este sitio está configurado para el canal:

- https://www.youtube.com/@iglesiacristianacongregaci5798

En [js/youtube.js](js/youtube.js) el handle está definido como:

- `HANDLE = "iglesiacristianacongregaci5798"`

El script intenta obtener el `channel_id (UC...)` de forma **best-effort** a partir del RSS legacy `?user=`. Si no logra obtenerlo, de todos modos muestra los videos usando ese feed.

## Desarrollo local (sin Node)

Puedes probarlo con cualquier servidor estático. Ejemplo con Python:

```bash
python -m http.server 8000
```

Luego abre:
- http://localhost:8000

## Despliegue en GitHub Pages

1. Sube este repo a GitHub.
2. En **Settings → Pages**, selecciona **Deploy from a branch**.
3. Elige la rama `main` y la carpeta `/ (root)`.

Para dominio personalizado:
- Agrega tu dominio en Pages y crea el archivo `CNAME` si GitHub te lo indica.

## Estructura

```
/index.html
/css/styles.css
/js/animations.js
/js/main.js
/js/youtube.js
/images/
```
