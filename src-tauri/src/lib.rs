mod config;
mod error;
mod i18n;
mod player;
mod plex;
mod plex_admin;
mod relay;
mod seerr;
mod tracearr;
mod update;

use anyhow::anyhow;
use config::{Config, SavedServer};
use error::CmdResult;
use player::{Entry, PlayerControl, Source};
use plex::{Adjacent, Genre, Hub, Item, WebStream, ItemDetail, LoginPin, Page, PlexServer, QueueTrack, Section};
use plex_admin::{Account, EditInfo, FieldChange, ImageChoice, Pref, ServerSession};
use std::collections::HashMap;
use seerr::{Seerr, SeerrDetail, SeerrMedia, SeerrSeason, Slider};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tracearr::{Dashboard, LoginState, Tracearr};

struct AppState {
    http: reqwest::Client,
    config_path: PathBuf,
    config: Mutex<Config>,
    seerr: tokio::sync::Mutex<Option<Arc<Seerr>>>,
    tracearr: tokio::sync::Mutex<Option<Arc<Tracearr>>>,
    player: Mutex<Option<PlayerControl>>,
    relay: Mutex<Option<relay::Relay>>,
    /// Logos trouvés (ou non) sur le service en ligne de Plex, par identifiant.
    remote_logos: Mutex<std::collections::HashMap<String, Option<String>>>,
}

impl AppState {
    fn cfg(&self) -> Config {
        self.config.lock().unwrap().clone()
    }

    fn update_cfg(&self, f: impl FnOnce(&mut Config)) -> anyhow::Result<()> {
        let mut config = self.config.lock().unwrap();
        f(&mut config);
        config.save(&self.config_path)
    }

    fn server(&self) -> anyhow::Result<PlexServer> {
        let c = self.cfg();
        let s = c.server.ok_or_else(|| anyhow!(crate::i18n::tr("app.noServer")))?;
        Ok(PlexServer { http: self.http.clone(), base: s.uri, token: s.token, client_id: c.client_id })
    }

    /// Session Seerr ouverte à la demande, puis réutilisée.
    async fn seerr(&self) -> anyhow::Result<Arc<Seerr>> {
        let mut slot = self.seerr.lock().await;
        if let Some(s) = slot.as_ref() {
            return Ok(s.clone());
        }
        let c = self.cfg();
        let url = c.seerr_url.ok_or_else(|| anyhow!(crate::i18n::tr("app.seerrNotConfigured")))?;
        let s = Arc::new(Seerr::connect(&url, c.plex_token).await?);
        *slot = Some(s.clone());
        Ok(s)
    }

    /// Client Tracearr, recréé depuis la configuration (adresse et cookies de session).
    async fn tracearr(&self) -> anyhow::Result<Arc<Tracearr>> {
        let mut slot = self.tracearr.lock().await;
        if let Some(t) = slot.as_ref() {
            return Ok(t.clone());
        }
        let c = self.cfg();
        let url = c.tracearr_url.ok_or_else(|| anyhow!(crate::i18n::tr("app.tracearrNotConfigured")))?;
        let t = Arc::new(Tracearr::new(&url, c.tracearr_cookies.as_deref())?);
        *slot = Some(t.clone());
        Ok(t)
    }

    /// Conserve les cookies de session Tracearr (renouvelés au fil des requêtes).
    fn save_tracearr_cookies(&self, t: &Tracearr) -> anyhow::Result<()> {
        let cookies = t.saved_cookies();
        if cookies != self.cfg().tracearr_cookies {
            self.update_cfg(|c| c.tracearr_cookies = cookies)?;
        }
        Ok(())
    }
}

// ---------- Session et réglages ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    logged_in: bool,
    server_name: Option<String>,
    seerr_url: Option<String>,
    mpv_path: Option<String>,
    tracearr_url: Option<String>,
    tracearr_connected: bool,
}

#[tauri::command]
fn get_session(state: State<'_, AppState>) -> Session {
    let c = state.cfg();
    Session {
        logged_in: c.plex_token.is_some(),
        server_name: c.server.map(|s| s.name),
        seerr_url: c.seerr_url,
        mpv_path: c.mpv_path,
        tracearr_url: c.tracearr_url,
        tracearr_connected: c.tracearr_cookies.is_some(),
    }
}

/// Ouvre une page web (bande-annonce, fiche IMDb…) dans le navigateur.
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> CmdResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(anyhow!(crate::i18n::tr_with("app.urlRefused", &[("url", &url)])).into());
    }
    app.opener().open_url(&url, None::<&str>)?;
    Ok(())
}

#[tauri::command]
fn set_mpv_path(state: State<'_, AppState>, path: Option<String>) -> CmdResult<()> {
    let path = path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    state.update_cfg(|c| c.mpv_path = path)?;
    Ok(())
}

// ---------- Compte et serveurs Plex ----------

#[tauri::command]
async fn plex_start_login(app: AppHandle, state: State<'_, AppState>, link: Option<bool>) -> CmdResult<LoginPin> {
    let link = link.unwrap_or(false);
    let pin = plex::create_pin(&state.http, &state.cfg().client_id, link).await?;
    if !link {
        app.opener().open_url(&pin.auth_url, None::<&str>)?;
    }
    Ok(pin)
}

#[tauri::command]
async fn plex_poll_login(state: State<'_, AppState>, pin_id: u64) -> CmdResult<bool> {
    let Some(token) = plex::check_pin(&state.http, &state.cfg().client_id, pin_id).await? else {
        return Ok(false);
    };
    state.update_cfg(|c| {
        c.plex_token = Some(token);
        c.server = None;
    })?;
    *state.seerr.lock().await = None;
    Ok(true)
}

#[tauri::command]
async fn plex_logout(state: State<'_, AppState>) -> CmdResult<()> {
    state.update_cfg(|c| {
        c.plex_token = None;
        c.server = None;
    })?;
    *state.seerr.lock().await = None;
    Ok(())
}

#[tauri::command]
fn plex_forget_server(state: State<'_, AppState>) -> CmdResult<()> {
    state.update_cfg(|c| c.server = None)?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerSummary {
    name: String,
    machine_id: String,
    owned: bool,
    /// Nom du propriétaire (serveurs partagés) et photo de son compte Plex.
    owner: Option<String>,
    owner_thumb: Option<String>,
}

#[tauri::command]
async fn plex_servers(state: State<'_, AppState>) -> CmdResult<Vec<ServerSummary>> {
    let c = state.cfg();
    let token = c.plex_token.ok_or_else(|| anyhow!(crate::i18n::tr("app.notLoggedIn")))?;
    let (servers, (own, friends)) = futures::join!(
        plex::servers(&state.http, &c.client_id, &token),
        plex::avatars(&state.http, &c.client_id, &token)
    );
    Ok(servers?
        .into_iter()
        .map(|r| {
            let owner_thumb = if r.owned {
                own.clone()
            } else {
                r.owner_id.and_then(|id| friends.iter().find(|(f, _)| *f == id).map(|(_, t)| t.clone()))
            };
            ServerSummary {
                name: r.name,
                machine_id: r.client_identifier,
                owned: r.owned,
                owner: (!r.owned).then_some(r.source_title).flatten(),
                owner_thumb,
            }
        })
        .collect())
}

#[tauri::command]
async fn plex_select_server(state: State<'_, AppState>, machine_id: String) -> CmdResult<String> {
    let c = state.cfg();
    let token = c.plex_token.ok_or_else(|| anyhow!(crate::i18n::tr("app.notLoggedIn")))?;
    let res = plex::servers(&state.http, &c.client_id, &token)
        .await?
        .into_iter()
        .find(|r| r.client_identifier == machine_id)
        .ok_or_else(|| anyhow!(crate::i18n::tr("app.serverNotFound")))?;
    let uri = plex::pick_connection(&state.http, &c.client_id, &res).await?;
    let name = res.name.clone();
    let saved = SavedServer { name: res.name, machine_id, uri, token: res.access_token.unwrap_or(token) };
    state.update_cfg(|c| c.server = Some(saved))?;
    Ok(name)
}

/// Au lancement : la meilleure adresse du serveur peut avoir changé (autre réseau, Wi-Fi ↔ 4G,
/// adresse locale devenue joignable) ; on la revérifie et on la garde si elle diffère.
async fn refresh_connection(state: &AppState) -> anyhow::Result<()> {
    let c = state.cfg();
    let (Some(token), Some(saved)) = (c.plex_token, c.server) else { return Ok(()) };
    let Some(res) = plex::servers(&state.http, &c.client_id, &token)
        .await?
        .into_iter()
        .find(|r| r.client_identifier == saved.machine_id)
    else {
        return Ok(());
    };
    let uri = plex::pick_connection(&state.http, &c.client_id, &res).await?;
    if uri != saved.uri {
        state.update_cfg(|c| {
            if let Some(s) = c.server.as_mut() {
                s.uri = uri;
            }
        })?;
    }
    Ok(())
}

// ---------- Bibliothèques ----------

#[tauri::command]
async fn plex_sections(state: State<'_, AppState>) -> CmdResult<Vec<Section>> {
    Ok(state.server()?.sections().await?)
}

#[tauri::command]
async fn plex_section_items(
    state: State<'_, AppState>,
    key: String,
    start: u32,
    size: u32,
    kind: Option<u32>,
    genre: Option<String>,
    sort: Option<String>,
) -> CmdResult<Page> {
    Ok(state
        .server()?
        .section_items(&key, start, size, kind, genre.as_deref(), sort.as_deref())
        .await?)
}

#[tauri::command]
async fn plex_adjacent(state: State<'_, AppState>, rating_key: String) -> CmdResult<Adjacent> {
    Ok(state.server()?.adjacent(&rating_key).await?)
}

#[tauri::command]
async fn plex_genres(state: State<'_, AppState>, key: String) -> CmdResult<Vec<Genre>> {
    Ok(state.server()?.genres(&key).await?)
}

#[tauri::command]
async fn plex_section_hubs(state: State<'_, AppState>, key: String) -> CmdResult<Vec<Hub>> {
    Ok(state.server()?.section_hubs(&key).await?)
}

#[tauri::command]
async fn plex_playlists(state: State<'_, AppState>, key: String) -> CmdResult<Vec<Item>> {
    Ok(state.server()?.playlists(&key).await?)
}

#[tauri::command]
async fn plex_tracks(state: State<'_, AppState>, rating_key: String) -> CmdResult<Vec<Item>> {
    Ok(state.server()?.tracks(&rating_key).await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Home {
    on_deck: Vec<Item>,
    recently_added: Vec<Item>,
}

#[tauri::command]
async fn plex_home(state: State<'_, AppState>) -> CmdResult<Home> {
    let server = state.server()?;
    let (on_deck, recently_added) = tokio::try_join!(server.on_deck(), server.recently_added())?;
    Ok(Home { on_deck, recently_added })
}

#[tauri::command]
async fn plex_metadata(state: State<'_, AppState>, rating_key: String) -> CmdResult<ItemDetail> {
    Ok(state.server()?.metadata(&rating_key).await?)
}

/// Logo d'un titre absent du serveur, cherché sur le service en ligne de Plex (une fois par titre).
#[tauri::command]
async fn plex_remote_logo(state: State<'_, AppState>, guid: String) -> CmdResult<Option<String>> {
    if let Some(known) = state.remote_logos.lock().unwrap().get(&guid) {
        return Ok(known.clone());
    }
    let c = state.cfg();
    let Some(token) = c.plex_token else { return Ok(None) };
    let logo = plex::remote_logo(&state.http, &c.client_id, &token, &guid).await.unwrap_or(None);
    state.remote_logos.lock().unwrap().insert(guid, logo.clone());
    Ok(logo)
}

/// Films et séries où joue une personne (identifiant Plex de l'acteur), toutes bibliothèques confondues.
#[tauri::command]
async fn plex_person_items(state: State<'_, AppState>, id: u64) -> CmdResult<Vec<plex::Item>> {
    Ok(state.server()?.person_items(id).await?)
}

#[tauri::command]
async fn plex_children(state: State<'_, AppState>, rating_key: String) -> CmdResult<Vec<Item>> {
    Ok(state.server()?.children(&rating_key).await?)
}

#[tauri::command]
async fn plex_search(state: State<'_, AppState>, query: String) -> CmdResult<Vec<Item>> {
    Ok(state.server()?.search(&query).await?)
}

#[tauri::command]
async fn plex_set_watched(state: State<'_, AppState>, rating_key: String, watched: bool) -> CmdResult<()> {
    Ok(state.server()?.set_watched(&rating_key, watched).await?)
}

// ---------- Administration du serveur ----------

#[tauri::command]
async fn plex_is_admin(state: State<'_, AppState>) -> CmdResult<bool> {
    Ok(state.server()?.is_admin().await)
}

#[tauri::command]
async fn plex_account(state: State<'_, AppState>) -> CmdResult<Account> {
    let c = state.cfg();
    let token = c.plex_token.ok_or_else(|| anyhow!(crate::i18n::tr("app.notLoggedIn")))?;
    Ok(plex_admin::account(&state.http, &c.client_id, &token).await?)
}

#[tauri::command]
async fn plex_edit_info(state: State<'_, AppState>, rating_key: String) -> CmdResult<EditInfo> {
    Ok(state.server()?.edit_info(&rating_key).await?)
}

#[tauri::command]
async fn plex_edit(
    state: State<'_, AppState>,
    rating_key: String,
    changes: Vec<FieldChange>,
    genres: Option<Vec<String>>,
) -> CmdResult<()> {
    Ok(state.server()?.edit(&rating_key, changes, genres).await?)
}

#[tauri::command]
async fn plex_images(state: State<'_, AppState>, rating_key: String, kind: String) -> CmdResult<Vec<ImageChoice>> {
    Ok(state.server()?.images(&rating_key, &kind).await?)
}

#[tauri::command]
async fn plex_set_image(state: State<'_, AppState>, rating_key: String, kind: String, url: String) -> CmdResult<()> {
    Ok(state.server()?.set_image(&rating_key, &kind, &url).await?)
}

#[tauri::command]
async fn plex_refresh_metadata(state: State<'_, AppState>, rating_key: String) -> CmdResult<()> {
    Ok(state.server()?.refresh_metadata(&rating_key).await?)
}

#[tauri::command]
async fn plex_analyze(state: State<'_, AppState>, rating_key: String) -> CmdResult<()> {
    Ok(state.server()?.analyze(&rating_key).await?)
}

#[tauri::command]
async fn plex_prefs(state: State<'_, AppState>) -> CmdResult<Vec<Pref>> {
    Ok(state.server()?.prefs().await?)
}

#[tauri::command]
async fn plex_set_prefs(state: State<'_, AppState>, changes: HashMap<String, String>) -> CmdResult<()> {
    Ok(state.server()?.set_prefs(changes).await?)
}

#[tauri::command]
async fn plex_sessions(state: State<'_, AppState>) -> CmdResult<Vec<ServerSession>> {
    Ok(state.server()?.sessions().await?)
}

#[tauri::command]
async fn plex_scan_section(state: State<'_, AppState>, key: String) -> CmdResult<()> {
    Ok(state.server()?.scan_section(&key).await?)
}

#[tauri::command]
async fn plex_empty_trash(state: State<'_, AppState>, key: String) -> CmdResult<()> {
    Ok(state.server()?.empty_trash(&key).await?)
}

// ---------- Lecture ----------

#[derive(Serialize)]
struct NowPlaying {
    session: String,
    title: String,
    subtitle: Option<String>,
    /// Vidéo incrustée dans la fenêtre de Plexr (Windows) ; sinon, fenêtre mpv séparée.
    embedded: bool,
}

#[derive(Serialize)]
struct MusicQueue {
    session: String,
    tracks: Vec<QueueTrack>,
    index: usize,
}

/// Mélange de Fisher-Yates, sans dépendance supplémentaire : l'aléa vient d'UUID v4.
fn shuffle<T>(list: &mut [T]) {
    for i in (1..list.len()).rev() {
        let j = (uuid::Uuid::new_v4().as_u128() % (i as u128 + 1)) as usize;
        list.swap(i, j);
    }
}

/// Arrête la lecture précédente (une seule à la fois, vidéo ou musique).
fn stop_player(state: &AppState) {
    drop(state.player.lock().unwrap().take());
}

#[tauri::command]
async fn play(
    app: AppHandle,
    state: State<'_, AppState>,
    rating_key: String,
    audio_stream: Option<u64>,
    subtitle_stream: Option<u64>,
    from_start: Option<bool>,
) -> CmdResult<NowPlaying> {
    let server = state.server()?;
    let mut info = server.play_info(&rating_key, audio_stream, subtitle_stream).await?;
    if from_start == Some(true) {
        info.offset_ms = 0;
    }
    let mpv = player::find_mpv(state.cfg().mpv_path.as_deref())?;
    stop_player(&state);

    #[cfg(windows)]
    let parent = Some(
        app.get_webview_window("main")
            .ok_or_else(|| anyhow!(crate::i18n::tr("app.mainWindowNotFound")))?
            .hwnd()?
            .0 as isize,
    );
    #[cfg(not(windows))]
    let parent = None;

    let session = uuid::Uuid::new_v4().to_string();
    let now = NowPlaying {
        session: session.clone(),
        title: info.title.clone(),
        subtitle: info.subtitle.clone(),
        embedded: parent.is_some(),
    };
    let entries = vec![Entry { rating_key, duration_ms: info.duration_ms }];
    let control = player::launch(app, server, mpv, session, entries, Source::Video { info, parent })?;
    *state.player.lock().unwrap() = Some(control);
    Ok(now)
}

/// Système d'exploitation (« windows », « linux », « macos », « android », « ios ») : sur mobile,
/// l'interface lit elle-même vidéo et musique au lieu de passer par mpv.
#[tauri::command]
fn platform() -> &'static str {
    std::env::consts::OS
}

/// Construit une file de lecture musicale (voir `play_music`) sans la lancer.
async fn build_queue(
    server: &PlexServer,
    rating_key: &str,
    keys: Option<Vec<String>>,
    start: Option<String>,
    shuffle: Option<bool>,
) -> anyhow::Result<(Vec<QueueTrack>, usize)> {
    let mut tracks: Vec<QueueTrack> = match keys {
        Some(keys) => futures::future::join_all(keys.iter().map(|k| server.queue(k)))
            .await
            .into_iter()
            .filter_map(Result::ok)
            .flatten()
            .collect(),
        None => server.queue(rating_key).await?,
    };
    if tracks.is_empty() {
        return Err(anyhow!(crate::i18n::tr("app.nothingToPlay")));
    }
    let mut index = start
        .as_deref()
        .and_then(|key| tracks.iter().position(|t| t.rating_key == key))
        .unwrap_or(0);
    if shuffle == Some(true) {
        // Le titre choisi (s'il y en a un) reste en tête.
        let first = start.is_some().then(|| tracks.remove(index));
        self::shuffle(&mut tracks);
        if let Some(t) = first {
            tracks.insert(0, t);
        }
        index = 0;
    }
    Ok((tracks, index))
}

/// File de lecture pour le lecteur intégré (mobile) : les titres et l'adresse de leur fichier.
#[tauri::command]
async fn music_queue(
    state: State<'_, AppState>,
    rating_key: String,
    keys: Option<Vec<String>>,
    start: Option<String>,
    shuffle: Option<bool>,
) -> CmdResult<MusicQueue> {
    let server = state.server()?;
    let (tracks, index) = build_queue(&server, &rating_key, keys, start, shuffle).await?;
    Ok(MusicQueue { session: uuid::Uuid::new_v4().to_string(), tracks, index })
}

/// Vidéo pour le lecteur intégré (mobile) : flux HLS du transcodeur Plex.
#[tauri::command]
async fn video_stream(
    state: State<'_, AppState>,
    rating_key: String,
    audio_stream: Option<u64>,
    subtitle_stream: Option<u64>,
) -> CmdResult<WebStream> {
    let session = uuid::Uuid::new_v4().simple().to_string();
    Ok(state.server()?.web_stream(&rating_key, audio_stream, subtitle_stream, &session).await?)
}

#[tauri::command]
async fn stop_transcode(state: State<'_, AppState>, session: String) -> CmdResult<()> {
    Ok(state.server()?.stop_transcode(&session).await?)
}

/// Progression envoyée par le lecteur intégré ; au-delà de 90 % à l'arrêt, l'élément est marqué vu.
#[tauri::command]
async fn report_timeline(
    state: State<'_, AppState>,
    rating_key: String,
    playback: String,
    time_ms: u64,
    duration_ms: u64,
) -> CmdResult<()> {
    let server = state.server()?;
    server.timeline(&rating_key, &playback, time_ms, duration_ms).await?;
    if playback == "stopped" && duration_ms > 0 && time_ms as f64 / duration_ms as f64 >= 0.9 {
        server.set_watched(&rating_key, true).await?;
    }
    Ok(())
}

/// Joue la musique d'un artiste, d'un album, d'une playlist ou un titre seul ; ou, avec `keys`,
/// une sélection de titres dans cet ordre. `start` : titre par lequel commencer ; `shuffle` : ordre aléatoire.
#[tauri::command]
async fn play_music(
    app: AppHandle,
    state: State<'_, AppState>,
    rating_key: String,
    keys: Option<Vec<String>>,
    start: Option<String>,
    shuffle: Option<bool>,
) -> CmdResult<MusicQueue> {
    let server = state.server()?;
    let (tracks, index) = build_queue(&server, &rating_key, keys, start, shuffle).await?;
    let mpv = player::find_mpv(state.cfg().mpv_path.as_deref())?;
    stop_player(&state);

    let session = uuid::Uuid::new_v4().to_string();
    let entries = tracks
        .iter()
        .map(|t| Entry { rating_key: t.rating_key.clone(), duration_ms: t.duration_ms })
        .collect();
    let urls = tracks.iter().map(|t| t.url.clone()).collect();
    let control = player::launch(app, server, mpv, session.clone(), entries, Source::Music { urls, start: index })?;
    *state.player.lock().unwrap() = Some(control);
    Ok(MusicQueue { session, tracks, index })
}

/// Commande mpv envoyée par la barre de lecture, par ex. `["cycle", "pause"]`.
#[tauri::command]
fn player_command(state: State<'_, AppState>, args: Vec<Value>) -> CmdResult<()> {
    let player = state.player.lock().unwrap();
    let control = player.as_ref().ok_or_else(|| anyhow!(crate::i18n::tr("app.noPlayback")))?;
    Ok(control.send(args)?)
}

#[tauri::command]
fn player_stop(state: State<'_, AppState>) {
    stop_player(&state);
}

// ---------- Seerr ----------

/// Enregistre l'adresse de Seerr et s'y connecte avec le compte Plex (adresse vide = désactivé).
#[tauri::command]
async fn seerr_configure(state: State<'_, AppState>, url: String) -> CmdResult<()> {
    let url = url.trim().trim_end_matches('/').to_string();
    let mut slot = state.seerr.lock().await;
    if url.is_empty() {
        *slot = None;
        state.update_cfg(|c| c.seerr_url = None)?;
        return Ok(());
    }
    let seerr = Seerr::connect(&url, state.cfg().plex_token).await?;
    state.update_cfg(|c| c.seerr_url = Some(url))?;
    *slot = Some(Arc::new(seerr));
    Ok(())
}

// ---------- Tracearr ----------

/// Enregistre l'adresse de Tracearr ; la session précédente est oubliée.
#[tauri::command]
async fn tracearr_configure(state: State<'_, AppState>, url: String) -> CmdResult<()> {
    let url = url.trim().trim_end_matches('/').to_string();
    if !url.is_empty() {
        Tracearr::new(&url, None)?;
    }
    *state.tracearr.lock().await = None;
    state.update_cfg(|c| {
        c.tracearr_url = (!url.is_empty()).then_some(url);
        c.tracearr_cookies = None;
    })?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TracearrLogin {
    handle: String,
    auth_url: String,
}

/// Lance la validation Plex de Tracearr : dans le navigateur (`open`, par défaut), ou pas du tout
/// quand l'interface montre le lien autrement (QR code sur téléviseur, téléphone du relais).
#[tauri::command]
async fn tracearr_start_login(app: AppHandle, state: State<'_, AppState>, open: Option<bool>) -> CmdResult<TracearrLogin> {
    let t = state.tracearr().await?;
    let login = t.start_login().await?;
    if open.unwrap_or(true) {
        app.opener().open_url(&login.auth_url, None::<&str>)?;
    }
    Ok(TracearrLogin { handle: login.handle, auth_url: login.auth_url })
}

#[tauri::command]
async fn tracearr_poll_login(state: State<'_, AppState>, handle: String) -> CmdResult<LoginState> {
    let t = state.tracearr().await?;
    let result = t.check_login(&handle).await?;
    if matches!(result, LoginState::Done) {
        state.save_tracearr_cookies(&t)?;
    }
    Ok(result)
}

#[tauri::command]
async fn tracearr_dashboard(state: State<'_, AppState>, timezone: String) -> CmdResult<Dashboard> {
    let t = state.tracearr().await?;
    let plex = state.server().ok();
    match t.dashboard(plex.as_ref(), &timezone).await {
        Ok(d) => {
            state.save_tracearr_cookies(&t)?;
            Ok(d)
        }
        Err(e) => {
            // Session expirée : on l'oublie pour reproposer la connexion.
            if e.to_string() == "SESSION_EXPIRED" {
                *state.tracearr.lock().await = None;
                state.update_cfg(|c| c.tracearr_cookies = None)?;
            }
            Err(e.into())
        }
    }
}

#[tauri::command]
async fn tracearr_logout(state: State<'_, AppState>) -> CmdResult<()> {
    if let Ok(t) = state.tracearr().await {
        t.logout().await;
    }
    *state.tracearr.lock().await = None;
    state.update_cfg(|c| c.tracearr_cookies = None)?;
    Ok(())
}

#[tauri::command]
async fn seerr_search(state: State<'_, AppState>, query: String, page: u32) -> CmdResult<Vec<SeerrMedia>> {
    Ok(state.seerr().await?.search(&query, page).await?)
}

#[tauri::command]
async fn seerr_trending(state: State<'_, AppState>, page: u32) -> CmdResult<Vec<SeerrMedia>> {
    Ok(state.seerr().await?.trending(page).await?)
}

#[tauri::command]
async fn seerr_details(state: State<'_, AppState>, media_type: String, tmdb_id: u64) -> CmdResult<SeerrDetail> {
    Ok(state.seerr().await?.details(&media_type, tmdb_id).await?)
}

#[tauri::command]
async fn seerr_related(
    state: State<'_, AppState>,
    media_type: String,
    tmdb_id: u64,
    relation: String,
) -> CmdResult<Vec<SeerrMedia>> {
    Ok(state.seerr().await?.related(&media_type, tmdb_id, &relation).await?)
}

#[tauri::command]
async fn seerr_slider(state: State<'_, AppState>, slider: Slider, page: u32) -> CmdResult<Vec<SeerrMedia>> {
    Ok(state.seerr().await?.slider(slider, page).await?)
}

#[tauri::command]
async fn seerr_recent_requests(state: State<'_, AppState>) -> CmdResult<Vec<SeerrMedia>> {
    Ok(state.seerr().await?.recent_requests().await?)
}

#[tauri::command]
async fn seerr_watchlist(state: State<'_, AppState>) -> CmdResult<Vec<SeerrMedia>> {
    Ok(state.seerr().await?.watchlist().await?)
}

#[tauri::command]
async fn seerr_tv_seasons(state: State<'_, AppState>, tmdb_id: u64) -> CmdResult<Vec<SeerrSeason>> {
    Ok(state.seerr().await?.tv_seasons(tmdb_id).await?)
}

#[tauri::command]
async fn seerr_request(
    state: State<'_, AppState>,
    media_type: String,
    tmdb_id: u64,
    seasons: Option<Vec<u32>>,
) -> CmdResult<()> {
    Ok(state.seerr().await?.create_request(&media_type, tmdb_id, seasons).await?)
}

// ---------- Langue ----------

/// Langue de l'interface, pour les messages du backend.
#[tauri::command]
fn set_language(language: String) {
    i18n::set_language(&language);
}

// ---------- Thème ----------

/// Icône de la fenêtre (et de la barre des tâches) aux couleurs du thème choisi.
#[tauri::command]
fn set_app_icon(app: AppHandle, theme: String) -> CmdResult<()> {
    #[cfg(desktop)]
    {
        let bytes: &[u8] = match theme.as_str() {
            "rouge" => include_bytes!("../icons/themes/rouge.png"),
            "vert" => include_bytes!("../icons/themes/vert.png"),
            "violet" => include_bytes!("../icons/themes/violet.png"),
            _ => include_bytes!("../icons/themes/jaune.png"),
        };
        if let Some(window) = app.get_webview_window("main") {
            let icon = tauri::image::Image::from_bytes(bytes).map_err(anyhow::Error::from)?;
            window.set_icon(icon).map_err(anyhow::Error::from)?;
        }
    }
    #[cfg(mobile)]
    let _ = (app, theme);
    Ok(())
}

// ---------- Mises à jour ----------

#[tauri::command]
async fn update_check(state: State<'_, AppState>) -> CmdResult<Option<update::UpdateInfo>> {
    Ok(update::check(&state.http).await?)
}

/// Télécharge la nouvelle version et lance son installation. Sur ordinateur, Plexr se ferme si
/// l'installeur le remplace ; sur Android, renvoie le fichier, que l'interface confie à Android.
#[tauri::command]
async fn update_install(app: AppHandle, info: update::UpdateInfo) -> CmdResult<Option<String>> {
    // Le téléchargement peut être long : pas de délai maximal, contrairement aux requêtes habituelles.
    let http = reqwest::Client::builder().connect_timeout(Duration::from_secs(20)).build().map_err(anyhow::Error::from)?;
    let dir = app.path().app_cache_dir().map_err(anyhow::Error::from)?.join("updates");
    let path = update::download(&app, &http, &info, &dir).await?;
    if cfg!(target_os = "android") {
        return Ok(Some(path.to_string_lossy().into_owned()));
    }
    if update::install(&path)? {
        app.exit(0);
    }
    Ok(None)
}

// ---------- Invitation par téléphone ----------

/// Ouvre le relais sur le réseau local ; renvoie l'adresse à mettre dans le QR code.
#[tauri::command]
async fn relay_start(app: AppHandle, state: State<'_, AppState>) -> CmdResult<String> {
    let relay = relay::start(app).await?;
    let url = relay.url.clone();
    *state.relay.lock().unwrap() = Some(relay);
    Ok(url)
}

/// Avancement de la configuration, affiché par la page du téléphone (JSON).
#[tauri::command]
fn relay_status(state: State<'_, AppState>, status: String) {
    if let Some(relay) = state.relay.lock().unwrap().as_ref() {
        relay.set_status(status);
    }
}

#[tauri::command]
fn relay_stop(state: State<'_, AppState>) {
    state.relay.lock().unwrap().take();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_path = app.path().app_config_dir()?.join("config.json");
            let config = Config::load(&config_path);
            config.save(&config_path)?;
            app.manage(AppState {
                http: reqwest::Client::builder().timeout(Duration::from_secs(30)).build()?,
                config_path,
                config: Mutex::new(config),
                seerr: tokio::sync::Mutex::new(None),
                tracearr: tokio::sync::Mutex::new(None),
                player: Mutex::new(None),
                relay: Mutex::new(None),
                remote_logos: Mutex::new(Default::default()),
            });
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = refresh_connection(&handle.state::<AppState>()).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_session,
            open_url,
            set_mpv_path,
            plex_start_login,
            plex_poll_login,
            plex_logout,
            plex_forget_server,
            plex_servers,
            plex_select_server,
            plex_sections,
            plex_section_items,
            plex_section_hubs,
            plex_genres,
            plex_adjacent,
            plex_playlists,
            plex_tracks,
            plex_home,
            plex_metadata,
            plex_children,
            plex_person_items,
            plex_remote_logo,
            plex_search,
            plex_set_watched,
            plex_is_admin,
            plex_account,
            plex_edit_info,
            plex_edit,
            plex_images,
            plex_set_image,
            plex_refresh_metadata,
            plex_analyze,
            plex_prefs,
            plex_set_prefs,
            plex_sessions,
            plex_scan_section,
            plex_empty_trash,
            play,
            play_music,
            platform,
            music_queue,
            video_stream,
            stop_transcode,
            report_timeline,
            player_command,
            player_stop,
            seerr_configure,
            seerr_search,
            seerr_trending,
            seerr_tv_seasons,
            seerr_request,
            seerr_details,
            seerr_related,
            seerr_slider,
            seerr_recent_requests,
            seerr_watchlist,
            tracearr_configure,
            tracearr_start_login,
            tracearr_poll_login,
            tracearr_dashboard,
            tracearr_logout,
            update_check,
            update_install,
            relay_start,
            relay_status,
            relay_stop,
            set_app_icon,
            set_language,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Plexr");
}
