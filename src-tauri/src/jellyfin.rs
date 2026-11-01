//! Client Jellyfin. Étape 1 : connexion (identifiant et mot de passe) et bibliothèques ; le reste
//! (accueil, fiches, lecture…) arrive à l'étape 2 et répond « pas encore disponible » d'ici là.

use anyhow::{anyhow, bail, Result};
use reqwest::{Client, RequestBuilder};
use serde::Deserialize;

use crate::plex::{Section, PRODUCT};

/// En-tête d'authentification de Jellyfin : l'application, l'appareil et, une fois connecté, le jeton.
fn authorization(client_id: &str, token: Option<&str>) -> String {
    let device = if cfg!(target_os = "android") { "Plexr (Android)" } else { "Plexr (PC)" };
    let mut value = format!(
        r#"MediaBrowser Client="{PRODUCT}", Device="{device}", DeviceId="{client_id}", Version="{}""#,
        env!("CARGO_PKG_VERSION")
    );
    if let Some(t) = token {
        value.push_str(&format!(r#", Token="{t}""#));
    }
    value
}

/// Adresse saisie par l'utilisateur, sans barre finale ; « http:// » si le schéma manque.
pub fn normalize_url(url: &str) -> String {
    let url = url.trim().trim_end_matches('/');
    if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else {
        format!("http://{url}")
    }
}

/// Résultat d'une connexion réussie.
pub struct Login {
    pub token: String,
    pub user_id: String,
    pub server_id: String,
    pub server_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AuthResult {
    access_token: String,
    user: AuthUser,
    server_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AuthUser {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PublicInfo {
    server_name: String,
}

/// Connexion par identifiant et mot de passe.
pub async fn login(http: &Client, base: &str, client_id: &str, username: &str, password: &str) -> Result<Login> {
    let info: PublicInfo = http
        .get(format!("{base}/System/Info/Public"))
        .send()
        .await
        .map_err(|_| anyhow!(crate::i18n::tr("jellyfin.unreachable")))?
        .error_for_status()
        .map_err(|_| anyhow!(crate::i18n::tr("jellyfin.notJellyfin")))?
        .json()
        .await
        .map_err(|_| anyhow!(crate::i18n::tr("jellyfin.notJellyfin")))?;
    let resp = http
        .post(format!("{base}/Users/AuthenticateByName"))
        .header("Authorization", authorization(client_id, None))
        .json(&serde_json::json!({ "Username": username, "Pw": password }))
        .send()
        .await?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        bail!(crate::i18n::tr("jellyfin.badCredentials"));
    }
    let auth: AuthResult = resp.error_for_status()?.json().await?;
    Ok(Login { token: auth.access_token, user_id: auth.user.id, server_id: auth.server_id, server_name: info.server_name })
}

/// Serveur Jellyfin connecté.
#[derive(Clone)]
pub struct JellyfinServer {
    pub http: Client,
    pub base: String,
    pub token: String,
    pub user_id: String,
    pub client_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Views {
    items: Vec<View>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct View {
    id: String,
    name: String,
    collection_type: Option<String>,
}

impl JellyfinServer {
    fn get(&self, path: &str) -> RequestBuilder {
        self.http
            .get(format!("{}{}", self.base, path))
            .header("Authorization", authorization(&self.client_id, Some(&self.token)))
    }

    /// Bibliothèques de l'utilisateur, avec le type que Plexr connaît (films, séries, musique).
    pub async fn sections(&self) -> Result<Vec<Section>> {
        let views: Views = self.get(&format!("/Users/{}/Views", self.user_id)).send().await?.error_for_status()?.json().await?;
        Ok(views
            .items
            .into_iter()
            .filter_map(|v| {
                let kind = match v.collection_type.as_deref()? {
                    "movies" => "movie",
                    "tvshows" => "show",
                    "music" => "artist",
                    _ => return None,
                };
                Some(Section { key: v.id, title: v.name, kind: kind.into() })
            })
            .collect())
    }
}
