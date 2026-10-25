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

console.log('Android parcheado: HOME + horizontal + permisos + MainActivity');
