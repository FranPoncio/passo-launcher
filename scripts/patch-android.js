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

// 3c) Botón Bluetooth del volante: servicio de accesibilidad que escucha las teclas multimedia
if (!m.includes('.ButtonService')) {
  m = m.replace('</application>', `
        <service
            android:name=".ButtonService"
            android:label="Passo Launcher: botón del volante"
            android:exported="true"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data android:name="android.accessibilityservice" android:resource="@xml/passo_buttons" />
        </service>
    </application>`);
}

fs.writeFileSync(manifestPath, m);

// Recursos del servicio de accesibilidad
fs.mkdirSync(path.join(root, 'res', 'xml'), { recursive: true });
fs.writeFileSync(path.join(root, 'res', 'xml', 'passo_buttons.xml'), `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagRequestFilterKeyEvents"
    android:canRequestFilterKeyEvents="true"
    android:notificationTimeout="100"
    android:description="@string/passo_buttons_desc" />
`);
fs.mkdirSync(path.join(root, 'res', 'values'), { recursive: true });
fs.writeFileSync(path.join(root, 'res', 'values', 'passo_strings.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="passo_buttons_desc">Permite que el botón Bluetooth del volante abra el asistente del Passo Launcher (mantener apretado play o doble toque). Un toque sigue siendo play/pausa.</string>
</resources>
`);

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
        registerPlugin(VoicePlugin.class);
        registerPlugin(ButtonsPlugin.class);
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

// 8) Voz: dictado (reconocimiento de Google) y lectura en voz alta (TTS) para el asistente
fs.writeFileSync(path.join(javaDir, 'VoicePlugin.java'), `package com.fran.passo;

import android.app.Activity;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(name = "Voice")
public class VoicePlugin extends Plugin implements TextToSpeech.OnInitListener {

    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
    }

    @Override
    public void onInit(int status) {
        ttsReady = status == TextToSpeech.SUCCESS;
    }

    private Locale locale(String tag) {
        String[] p = tag.split("-");
        return p.length > 1 ? new Locale(p[0], p[1]) : new Locale(p[0]);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "es-AR"));
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Hablá"));
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, i, "onSpeech");
        } catch (Exception e) {
            call.reject("No hay reconocimiento de voz en esta tablet (instalá la app de Google)");
        }
    }

    @ActivityCallback
    private void onSpeech(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject o = new JSObject();
        String text = "";
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> r = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (r != null && !r.isEmpty()) text = r.get(0);
        }
        o.put("text", text);
        call.resolve(o);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!ttsReady || tts == null) { call.reject("Lectura en voz alta no disponible"); return; }
        tts.setLanguage(locale(call.getString("lang", "es-AR")));
        tts.speak(call.getString("text", ""), TextToSpeech.QUEUE_FLUSH, null, "passo");
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) tts.shutdown();
    }
}
`);

// 9) Botón del volante: el servicio escucha play/pausa en cualquier app
fs.writeFileSync(path.join(javaDir, 'ButtonService.java'), `package com.fran.passo;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

public class ButtonService extends AccessibilityService {

    static ButtonService instance;
    private final Handler h = new Handler(Looper.getMainLooper());
    private boolean longFired = false;
    private int pendingClicks = 0;

    private final Runnable longRun = new Runnable() {
        @Override public void run() { longFired = true; openAssistant(); }
    };
    private final Runnable singleRun = new Runnable() {
        @Override public void run() { pendingClicks = 0; sendMedia(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE); }
    };

    @Override protected void onServiceConnected() { instance = this; }
    @Override public void onAccessibilityEvent(AccessibilityEvent e) {}
    @Override public void onInterrupt() {}
    @Override public boolean onUnbind(Intent i) { instance = null; return super.onUnbind(i); }

    private SharedPreferences prefs() { return getSharedPreferences("passo_buttons", MODE_PRIVATE); }

    @Override
    protected boolean onKeyEvent(KeyEvent e) {
        int c = e.getKeyCode();
        if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) ButtonsPlugin.emitKey(c);
        SharedPreferences p = prefs();
        if (!p.getBoolean("enabled", true)) return false;

        // Botón de asistente del control (el de "Siri"): abre el asistente directo
        if (c == KeyEvent.KEYCODE_VOICE_ASSIST || c == KeyEvent.KEYCODE_ASSIST || c == KeyEvent.KEYCODE_SEARCH) {
            if (e.getAction() == KeyEvent.ACTION_UP) openAssistant();
            return true;
        }
        boolean isPlay = c == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || c == KeyEvent.KEYCODE_HEADSETHOOK
                || c == KeyEvent.KEYCODE_MEDIA_PLAY || c == KeyEvent.KEYCODE_MEDIA_PAUSE;
        if (!isPlay) return false;
        boolean useLong = p.getBoolean("long", true), useDouble = p.getBoolean("double", true);
        if (!useLong && !useDouble) return false;

        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            if (e.getRepeatCount() == 0) {
                longFired = false;
                if (useLong) h.postDelayed(longRun, 700);
            }
            return true;
        }
        if (e.getAction() == KeyEvent.ACTION_UP) {
            h.removeCallbacks(longRun);
            if (longFired) { longFired = false; return true; }
            if (useDouble) {
                if (pendingClicks == 1) { h.removeCallbacks(singleRun); pendingClicks = 0; openAssistant(); }
                else { pendingClicks = 1; h.postDelayed(singleRun, 380); }
            } else {
                sendMedia(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
            }
            return true;
        }
        return true;
    }

    private void sendMedia(int code) {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        long t = SystemClock.uptimeMillis();
        am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, code, 0));
        am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_UP, code, 0));
    }

    private void openAssistant() {
        Intent i = new Intent(this, MainActivity.class);
        i.putExtra("passo_action", "assistant");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        startActivity(i);
    }
}
`);

// 10) Plugin del botón: estado, abrir Accesibilidad, opciones y avisos al launcher
fs.writeFileSync(path.join(javaDir, 'ButtonsPlugin.java'), `package com.fran.passo;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.view.KeyEvent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Buttons")
public class ButtonsPlugin extends Plugin {

    static ButtonsPlugin self;

    @Override
    public void load() {
        self = this;
        if (getActivity() != null) checkIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        checkIntent(intent);
    }

    private void checkIntent(Intent i) {
        if (i != null && "assistant".equals(i.getStringExtra("passo_action"))) {
            i.removeExtra("passo_action");
            JSObject o = new JSObject();
            o.put("action", "assistant");
            notifyListeners("action", o, true);
        }
    }

    static void emitKey(int code) {
        if (self == null) return;
        JSObject o = new JSObject();
        o.put("code", code);
        o.put("name", KeyEvent.keyCodeToString(code));
        self.notifyListeners("key", o);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("passo_buttons", Context.MODE_PRIVATE);
    }

    private boolean enabledInSettings() {
        String s = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return s != null && s.contains(getContext().getPackageName());
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        SharedPreferences p = prefs();
        r.put("enabled", ButtonService.instance != null || enabledInSettings());
        r.put("long", p.getBoolean("long", true));
        r.put("double", p.getBoolean("double", true));
        call.resolve(r);
    }

    @PluginMethod
    public void setConfig(PluginCall call) {
        SharedPreferences p = prefs();
        p.edit()
            .putBoolean("long", call.getBoolean("long", p.getBoolean("long", true)))
            .putBoolean("double", call.getBoolean("double", p.getBoolean("double", true)))
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
`);

console.log('Android parcheado: HOME + horizontal + permisos + MainActivity + AppIcons + Media + Voice + Buttons');
