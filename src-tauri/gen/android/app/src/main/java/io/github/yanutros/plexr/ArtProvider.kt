package io.github.yanutros.plexr

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException
import java.net.URL

/**
 * Pochettes pour Android Auto, qui n'accepte que des adresses locales : `content://…art/img?t=<thumb>`
 * télécharge l'image depuis le serveur Plex (une fois, gardée en cache) et la sert en fichier.
 * Non exporté : seule la voiture y a accès, par les droits accordés dans PlexLibrary.
 */
class ArtProvider : ContentProvider() {
  private val library by lazy { PlexLibrary(context!!) }

  override fun onCreate() = true

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    val thumb = uri.getQueryParameter("t") ?: throw FileNotFoundException()
    val dir = File(context!!.cacheDir, "art").apply { mkdirs() }
    val file = File(dir, Integer.toHexString(thumb.hashCode()) + ".jpg")
    if (!file.exists()) {
      val tmp = File(dir, file.name + ".tmp")
      runCatching {
        URL(library.artUrl(thumb)).openStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
        tmp.renameTo(file)
      }.onFailure { tmp.delete(); throw FileNotFoundException(thumb) }
    }
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  override fun getType(uri: Uri) = "image/jpeg"
  override fun query(uri: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?): Cursor? = null
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun delete(uri: Uri, s: String?, a: Array<String>?) = 0
  override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?) = 0
}
