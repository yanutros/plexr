package io.github.yanutros.plexr

import android.app.UiModeManager
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import java.io.File

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Le WebView annonce un écran tactile même sur téléviseur : l'interface demande donc à
  // Android (`window.PlexrDevice.isTv()`) si l'appareil est en mode télévision.
  override fun onWebViewCreate(webView: WebView) {
    val tv = (getSystemService(UI_MODE_SERVICE) as UiModeManager).currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
      packageManager.hasSystemFeature("android.software.leanback_only")
    // Sur téléviseur, la page fixe sa propre largeur (balise viewport) et le WebView la réduit à l'écran.
    if (tv) {
      webView.settings.useWideViewPort = true
      webView.settings.loadWithOverviewMode = true
    }
    // Sur téléviseur, la page reçoit les touches dès le premier appui sur la télécommande.
    if (tv) webView.post { webView.requestFocus() }
    webView.addJavascriptInterface(object {
      @JavascriptInterface
      fun isTv(): Boolean = tv

      /**
       * Mise à jour : confie l'APK téléchargé (dans le cache de Plexr) à l'installateur d'Android.
       * Renvoie « permission » si Plexr n'a pas encore le droit d'installer des applications : Android
       * ouvre alors l'écran où l'accorder, et il suffit de relancer la mise à jour.
       */
      @JavascriptInterface
      fun installApk(path: String): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
          runOnUiThread {
            try {
              startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            } catch (_: Exception) {
              // Certains téléviseurs n'ont pas cet écran : l'autorisation se donne dans leurs paramètres.
            }
          }
          return "permission"
        }
        val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", File(path))
        runOnUiThread {
          startActivity(
            Intent(Intent.ACTION_VIEW)
              .setDataAndType(uri, "application/vnd.android.package-archive")
              .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
          )
        }
        return "ok"
      }
    }, "PlexrDevice")
  }
}
