//! Traductions des messages du backend (erreurs, page du téléphone), dans la langue choisie par
//! l'interface. Même format que le front : JSON par langue dans `src-tauri/locales`, clés
//! imbriquées (« seerr.unreachable »), variables `{{nom}}` ; repli sur l'anglais puis le français.

use serde_json::Value;
use std::sync::{OnceLock, RwLock};

const LOCALES: [(&str, &str); 5] = [
    ("fr", include_str!("../locales/fr.json")),
    ("en", include_str!("../locales/en.json")),
    ("es", include_str!("../locales/es.json")),
    ("de", include_str!("../locales/de.json")),
    ("nl", include_str!("../locales/nl.json")),
];

static LANGUAGE: RwLock<&str> = RwLock::new("en");

fn dicts() -> &'static Vec<(&'static str, Value)> {
    static DICTS: OnceLock<Vec<(&'static str, Value)>> = OnceLock::new();
    DICTS.get_or_init(|| LOCALES.iter().map(|(id, json)| (*id, serde_json::from_str(json).unwrap_or_default())).collect())
}

/// Langue de l'interface (« fr », « en »…) ; inconnue = anglais.
pub fn set_language(language: &str) {
    if let Some((id, _)) = LOCALES.iter().find(|(id, _)| *id == language) {
        *LANGUAGE.write().unwrap() = id;
    }
}

pub fn language() -> &'static str {
    *LANGUAGE.read().unwrap()
}

fn lookup(lang: &str, key: &str) -> Option<String> {
    let dict = &dicts().iter().find(|(id, _)| *id == lang)?.1;
    key.split('.').try_fold(dict, |node, part| node.get(part))?.as_str().map(str::to_owned)
}

/// Texte traduit (la clé elle-même si elle n'existe nulle part).
pub fn tr(key: &str) -> String {
    lookup(language(), key).or_else(|| lookup("en", key)).or_else(|| lookup("fr", key)).unwrap_or_else(|| key.to_owned())
}

/// Texte traduit avec ses variables : `tr_with("seerr.refused", &[("status", "403")])`.
pub fn tr_with(key: &str, args: &[(&str, &str)]) -> String {
    args.iter().fold(tr(key), |text, (name, value)| text.replace(&format!("{{{{{name}}}}}"), value))
}

/// Toutes les traductions d'une section (pour la page du téléphone), en JSON.
pub fn section_json(section: &str) -> String {
    let pick = |lang: &str| dicts().iter().find(|(id, _)| *id == lang).and_then(|(_, d)| d.get(section).cloned());
    let mut merged = pick("fr").unwrap_or_default();
    for lang in ["en", language()] {
        if let (Some(target), Some(Value::Object(src))) = (merged.as_object_mut(), pick(lang)) {
            target.extend(src);
        }
    }
    merged.to_string()
}
