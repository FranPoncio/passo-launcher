// Convierte el proyecto Android generado por Capacitor en un launcher (HOME)
// con permisos de GPS y Bluetooth. Se corre después de `npx cap add android`.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'android', 'app', 'src', 'main');
const manifestPath = path.join(root, 'AndroidManifest.xml');
let m = fs.readFileSync(manifestPath, 'utf8');

// 1) Registrarse como pantalla de inicio (HOME) además de app normal
if (!m.includes('android.intent.category.HOME')) {
  m = m.replace(
    /(<category android:name="android.intent.category.LAUNCHER" \/>\s*<\/intent-filter>)/,
    `$1

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.HOME" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>`
  );
}

// 2) Siempre horizontal
if (!m.includes('screenOrientation')) {
  m = m.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"');
}

// 3) Permisos
const perms = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.WAKE_LOCK'
];
const permXml = perms
  .filter(p => !m.includes(`"${p}"`))
  .map(p => `    <uses-permission android:name="${p}" />`)
  .join('\n');
if (permXml) m = m.replace('</manifest>', `${permXml}\n</manifest>`);

// 3b) Servicio para leer la música que suena (Spotify, YT Music, etc.)
if (!m.includes('.MediaListener')) {
  m = m.replace('</application>', `
        <service
            android:name=".MediaListener"
            android:label="Passo Launcher"
            android:exported="true"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
    </application>`);
}

fs.writeFileSync(manifestPath, m);

// 4) MainActivity: pide permisos al arrancar, pantalla siempre encendida, pantalla completa
const javaDir = path.join(root, 'java', 'com', 'fran', 'passo');
fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), `package com.fran.passo;

import android.Manifest;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppIconsPlugin.class);
        registerPlugin(MediaPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        ArrayList<String> p = new ArrayList<>();
        p.add(Manifest.permission.ACCESS_FINE_LOCATION);
        p.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= 31) {
            p.add(Manifest.permission.BLUETOOTH_CONNECT);
            p.add(Manifest.permission.BLUETOOTH_SCAN);
        }
        requestPermissions(p.toArray(new String[0]), 42);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.statusBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
`);

// 5) Plugin propio: devuelve el ícono real de cada app instalada (como data URL PNG)
fs.writeFileSync(path.join(javaDir, 'AppIconsPlugin.java'), `package com.fran.passo;

import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "AppIcons")
public class AppIconsPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        JSArray packages = call.getArray("packages");
        JSObject icons = new JSObject();
        JSObject labels = new JSObject();
        PackageManager pm = getContext().getPackageManager();
        try {
            for (int i = 0; i < packages.length(); i++) {
                String pkg = packages.getString(i);
                try {
                    Drawable d = pm.getApplicationIcon(pkg);
                    icons.put(pkg, toDataUrl(d));
                    labels.put(pkg, pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString());
                } catch (PackageManager.NameNotFoundException e) {
                    // App no instalada: la interfaz usa su ícono de respaldo
                }
            }
        } catch (Exception e) {
            call.reject("No pude leer los íconos: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("icons", icons);
        ret.put("labels", labels);
        call.resolve(ret);
    }

    private String toDataUrl(Drawable d) {
        int size = 144;
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        d.setBounds(0, 0, size, size);
        d.draw(c);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
`);

// 6) Música: servicio vacío (Android lo exige para dar acceso a las sesiones de medios)
fs.writeFileSync(path.join(javaDir, 'MediaListener.java'), `package com.fran.passo;

import android.service.notification.NotificationListenerService;

public class MediaListener extends NotificationListenerService {}
`);

// 7) Plugin propio: qué suena (tema, artista, tapa) y control play/pausa/siguiente/anterior
fs.writeFileSync(path.join(javaDir, 'MediaPlugin.java'), `package com.fran.passo;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.List;

@CapacitorPlugin(name = "Media")
public class MediaPlugin extends Plugin {

    private boolean granted() {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(getContext().getPackageName());
    }

    private MediaController current() {
        MediaSessionManager m = (MediaSessionManager) getContext().getSystemService(Context.MEDIA_SESSION_SERVICE);
        List<MediaController> list = m.getActiveSessions(new ComponentName(getContext(), MediaListener.class));
        if (list == null || list.isEmpty()) return null;
        for (MediaController c : list) {
            PlaybackState s = c.getPlaybackState();
            if (s != null && s.getState() == PlaybackState.STATE_PLAYING) return c;
        }
        return list.get(0);
    }

    @PluginMethod
    public void hasAccess(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject r = new JSObject();
        if (!granted()) { r.put("active", false); r.put("noAccess", true); call.resolve(r); return; }
        try {
            MediaController c = current();
            if (c == null) { r.put("active", false); call.resolve(r); return; }
            r.put("active", true);
            r.put("pkg", c.getPackageName());
            MediaMetadata md = c.getMetadata();
            String title = "";
            if (md != null) {
                title = md.getString(MediaMetadata.METADATA_KEY_TITLE);
                if (title == null) title = "";
                String artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
                if (artist == null) artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                r.put("title", title);
                r.put("artist", artist == null ? "" : artist);
                r.put("duration", md.getLong(MediaMetadata.METADATA_KEY_DURATION));
                // La tapa solo se manda cuando cambia el tema (para no cargar la tablet)
                if (!title.equals(call.getString("known", ""))) {
                    Bitmap art = md.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
                    if (art == null) art = md.getBitmap(MediaMetadata.METADATA_KEY_ART);
                    if (art != null) {
                        int h = Math.max(1, 240 * art.getHeight() / Math.max(1, art.getWidth()));
                        Bitmap sc = Bitmap.createScaledBitmap(art, 240, h, true);
                        ByteArrayOutputStream o = new ByteArrayOutputStream();
                        sc.compress(Bitmap.CompressFormat.JPEG, 82, o);
                        r.put("art", "data:image/jpeg;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP));
                    } else {
                        r.put("art", "");
                    }
                }
            }
            PlaybackState st = c.getPlaybackState();
            if (st != null) {
                boolean playing = st.getState() == PlaybackState.STATE_PLAYING;
                long pos = st.getPosition();
                if (playing && st.getLastPositionUpdateTime() > 0) {
                    pos += (long) ((SystemClock.elapsedRealtime() - st.getLastPositionUpdateTime()) * st.getPlaybackSpeed());
                }
                r.put("playing", playing);
                r.put("position", pos);
            }
        } catch (SecurityException e) {
            r.put("active", false);
            r.put("noAccess", true);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void control(PluginCall call) {
        String a = call.getString("action", "toggle");
        try {
            MediaController c = current();
            if (c == null) { call.reject("No hay música activa"); return; }
            MediaController.TransportControls t = c.getTransportControls();
            PlaybackState st = c.getPlaybackState();
            boolean playing = st != null && st.getState() == PlaybackState.STATE_PLAYING;
            if ("next".equals(a)) t.skipToNext();
            else if ("prev".equals(a)) t.skipToPrevious();
            else if (playing) t.pause();
            else t.play();
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Sin permiso de acceso a notificaciones");
        }
    }
}
`);

console.log('Android parcheado: HOME + horizontal + permisos + MainActivity + AppIcons + Media');
