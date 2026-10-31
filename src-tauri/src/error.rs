use serde::{Serialize, Serializer};

/// Erreur renvoyée aux commandes Tauri : sérialisée en simple message pour l'interface.
#[derive(Debug)]
pub struct AppError(anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        AppError(e.into())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&format!("{:#}", self.0))
    }
}

pub type CmdResult<T> = Result<T, AppError>;
