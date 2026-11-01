package io.github.yanutros.plexr

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import org.json.JSONObject
import java.net.URL
import kotlin.concurrent.thread

/**
 * Musique en arrière-plan : la lecture se fait dans la page (élément <audio>), ce service la garde
 * en vie quand Plexr est quitté et l'expose à Android par une session média — notification avec
 * pochette et commandes, écran de verrouillage, boutons d'un casque Bluetooth. Les commandes
 * repartent vers la page (`window.__plexrMedia`).
 */
class MediaService : Service() {
  companion object {
    private const val CHANNEL = "playback"
    private const val NOTIFICATION_ID = 1

    var instance: MediaService? = null
      private set

    /** Page qui reçoit les commandes (posée par MainActivity). */
    var webView: WebView? = null

    /** Une musique est en cours de lecture (et non en pause). */
    val playing: Boolean
      get() = instance?.state?.optBoolean("playing") == true

    /** État envoyé par la page (JSON : title, artist, album, art, playing, position, duration, hasNext). */
    fun update(context: Context, json: String) {
      instance?.applyState(JSONObject(json)) ?: ContextCompat.startForegroundService(
        context,
        Intent(context, MediaService::class.java).putExtra("state", json),
      )
    }

    fun stop() {
      instance?.stopSelf()
    }

    /** Commande vers la page : play, pause, next, previous, stop, seek:<ms>. */
    fun dispatch(action: String) {
      webView?.post { webView?.evaluateJavascript("window.__plexrMedia && window.__plexrMedia('$action')", null) }
    }
  }

  private lateinit var session: MediaSessionCompat
  private var state = JSONObject()
  private var artUrl: String? = null
  private var art: Bitmap? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    session = MediaSessionCompat(this, "Plexr").apply {
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() = dispatch("play")
        override fun onPause() = dispatch("pause")
        override fun onSkipToNext() = dispatch("next")
        override fun onSkipToPrevious() = dispatch("previous")
        override fun onStop() = dispatch("stop")
        override fun onSeekTo(pos: Long) = dispatch("seek:$pos")
      })
      setSessionActivity(
        PendingIntent.getActivity(
          this@MediaService, 0,
          Intent(this@MediaService, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
          PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      isActive = true
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, getString(R.string.app_name), NotificationManager.IMPORTANCE_LOW),
      )
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Boutons de la notification : relayés à la page.
    intent?.action?.let { dispatch(it) }
    intent?.getStringExtra("state")?.let { applyState(JSONObject(it)) }
    return START_NOT_STICKY
  }

  private fun applyState(next: JSONObject) {
    state = next
    val url = state.optString("art").takeIf { it.isNotEmpty() }
    if (url != artUrl) {
      artUrl = url
      art = null
      // La pochette se charge à part, puis la notification est redessinée avec.
      if (url != null) thread {
        val bitmap = runCatching { URL(url).openStream().use(BitmapFactory::decodeStream) }.getOrNull()
        if (url == artUrl) {
          art = bitmap
          publish()
        }
      }
    }
    publish()
  }

  @Synchronized
  private fun publish() {
    val playing = state.optBoolean("playing")
    session.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state.optString("title"))
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state.optString("artist"))
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, state.optString("album"))
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, state.optLong("duration"))
        .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art)
        .build(),
    )
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_SEEK_TO or PlaybackStateCompat.ACTION_STOP,
        )
        .setState(
          if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
          state.optLong("position"),
          if (playing) 1f else 0f,
        )
        .build(),
    )

    fun action(icon: Int, title: String, command: String) = NotificationCompat.Action(
      icon, title,
      PendingIntent.getService(
        this, command.hashCode(),
        Intent(this, MediaService::class.java).setAction(command),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      ),
    )

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_plexr)
      .setContentTitle(state.optString("title"))
      .setContentText(state.optString("artist"))
      .setSubText(state.optString("album"))
      .setLargeIcon(art)
      .setContentIntent(session.controller.sessionActivity)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setOngoing(playing)
      .addAction(action(android.R.drawable.ic_media_previous, "Previous", "previous"))
      .addAction(
        if (playing) action(android.R.drawable.ic_media_pause, "Pause", "pause")
        else action(android.R.drawable.ic_media_play, "Play", "play"),
      )
      .addAction(action(android.R.drawable.ic_media_next, "Next", "next"))
      .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
      .build()

    ServiceCompat.startForeground(
      this, NOTIFICATION_ID, notification,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0,
    )
  }

  /** Plexr fermé depuis les applications récentes : la musique s'arrête avec lui. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    dispatch("stop")
    stopSelf()
  }

  override fun onDestroy() {
    instance = null
    session.isActive = false
    session.release()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
