use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Configuration persistée dans le dossier de configuration de l'application.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Identifiant unique de ce client auprès de Plex (X-Plex-Client-Identifier).
    pub client_id: String,
    pub plex_token: Option<String>,
    pub server: Option<SavedServer>,
    /// Seerr s'ouvre toujours avec le compte Plex de l'utilisateur.
    pub seerr_url: Option<String>,
    pub mpv_path: Option<String>,
    pub tracearr_url: Option<String>,
    /// Cookies de session Tracearr (« nom=valeur; … »), valables 30 jours.
    pub tracearr_cookies: Option<String>,
    /// Clé d'API TMDB de l'utilisateur (facultative) : logos des titres que Plex n'a pas.
    pub tmdb_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedServer {
    pub name: String,
    pub machine_id: String,
    pub uri: String,
    pub token: String,
}

impl Config {
    pub fn load(path: &Path) -> Self {
        let mut config: Config = match std::fs::read_to_string(path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            // Premier lancement : Seerr et Tracearr se configurent ensuite (à la main ou par invitation).
            Err(_) => Config::default(),
        };
        if config.client_id.is_empty() {
            config.client_id = uuid::Uuid::new_v4().to_string();
        }
        config
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}
