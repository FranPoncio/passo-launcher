# Passo Launcher

Launcher Android para la tablet del Toyota Passo 1.3 (K3-VE). Muestra velocidad por GPS, datos del OBD2 (ELM327 Bluetooth clásico), alertas de service, WOF y rego, registro de nafta y un panel de turno para delivery.

## Bajar el APK (sin instalar nada en la PC)

1. En GitHub, pestaña **Actions** > el último run de **Compilar APK** (con tilde verde).
2. Abajo, en **Artifacts**, descargá `passo-launcher-apk` (es un .zip con `app-debug.apk` adentro).
3. Pasá `app-debug.apk` a la tablet (pendrive, Drive o cable) y abrilo. Android va a pedir permiso para "instalar apps de origen desconocido": aceptá.
4. Abrí la app y aceptá ubicación y dispositivos cercanos (Bluetooth).
5. Apretá el botón Home: elegí **Passo Launcher** > **Siempre**.

Cada vez que se cambia algo en `main`, GitHub compila un APK nuevo solo. También se puede lanzar a mano desde Actions > Compilar APK > Run workflow.

## Emparejar el OBD

1. Enchufá el ELM327 y poné contacto.
2. Ajustes de Android > Bluetooth > emparejar (PIN 1234 o 0000).
3. En el launcher: OBD > Conectar. Queda guardado y se reconecta solo.

Para probar sin auto: OBD > Modo demo.

## Cómo está armado

- `www/index.html`: toda la interfaz (no necesita internet).
- `scripts/patch-android.js`: convierte la app en launcher (HOME), la deja horizontal, con pantalla siempre encendida y con los permisos de GPS y Bluetooth.
- `.github/workflows/build-apk.yml`: compila el APK en GitHub.

## Límites

- El L/100 instantáneo usa el sensor MAF. Si el auto no lo reporta, queda en "--". El promedio por tanque lleno siempre funciona.
- El odómetro se suma por GPS. Corregilo una vez en Service con el valor del tablero.
- Si la ROM china no ofrece elegir launcher, buscá en Ajustes > Apps > Apps predeterminadas > Inicio.
