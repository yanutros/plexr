//! Relais d'invitation : pendant que l'écran « Configurer avec ton téléphone » est ouvert, Plexr
//! sert sur le réseau local une petite page à une adresse secrète (affichée en QR code). Le
//! téléphone y envoie le code d'invitation de l'administrateur ; l'interface l'applique et publie
//! l'avancement (dont le lien d'autorisation Tracearr), que la page du téléphone affiche.

use anyhow::{anyhow, Result};
use std::net::{IpAddr, UdpSocket};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

const PAGE: &str = include_str!("relay.html");
/// Lecture des QR codes sur le téléphone (jsQR, Apache-2.0), intégrée à la page.
const JSQR: &str = include_str!("../../node_modules/jsqr/dist/jsQR.js");

pub struct Relay {
    pub url: String,
    status: Arc<Mutex<String>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

impl Relay {
    pub fn set_status(&self, json: String) {
        *self.status.lock().unwrap() = json;
    }
}

impl Drop for Relay {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Adresse de l'appareil sur le réseau local (celle de l'interface qui mène vers l'extérieur).
fn lan_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    // Aucun paquet n'est envoyé : la « connexion » UDP choisit seulement l'interface de sortie.
    socket.connect("192.0.2.1:9").ok()?;
    socket.local_addr().ok().map(|a| a.ip())
}

pub async fn start(app: AppHandle) -> Result<Relay> {
    let ip = lan_ip().ok_or_else(|| anyhow!("Cet appareil n'est relié à aucun réseau"))?;
    let listener = TcpListener::bind("0.0.0.0:0").await?;
    let port = listener.local_addr()?.port();
    let token = uuid::Uuid::new_v4().simple().to_string();
    let status = Arc::new(Mutex::new(r#"{"step":"waiting"}"#.to_string()));
    let page = Arc::new(PAGE.replace("/*JSQR*/", JSQR));

    let task = {
        let (token, status) = (token.clone(), status.clone());
        tauri::async_runtime::spawn(async move {
            while let Ok((conn, _)) = listener.accept().await {
                let (app, token, status, page) = (app.clone(), token.clone(), status.clone(), page.clone());
                tauri::async_runtime::spawn(async move {
                    let _ = serve(conn, &app, &token, &status, &page).await;
                });
            }
        })
    };
    Ok(Relay { url: format!("http://{ip}:{port}/{token}"), status, task })
}

async fn serve(mut conn: TcpStream, app: &AppHandle, token: &str, status: &Mutex<String>, page: &str) -> Result<()> {
    // En-têtes puis corps (8 Ko au plus : un code d'invitation est bien plus court).
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let header_end = loop {
        let n = conn.read(&mut chunk).await?;
        if n == 0 {
            return Ok(());
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break i + 4;
        }
        if buf.len() > 16 * 1024 {
            return Ok(());
        }
    };
    let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let mut parts = head.lines().next().unwrap_or_default().split(' ');
    let (method, path) = (parts.next().unwrap_or_default(), parts.next().unwrap_or_default());
    let length = head
        .lines()
        .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse().unwrap_or(0)))
        .unwrap_or(0usize)
        .min(8 * 1024);
    while buf.len() < header_end + length {
        let n = conn.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let body = String::from_utf8_lossy(&buf[header_end..buf.len().min(header_end + length)]).to_string();

    let base = format!("/{token}");
    let (code, kind, content) = match (method, path) {
        ("GET", p) if p == base => ("200 OK", "text/html; charset=utf-8", page.to_string()),
        ("GET", p) if p == format!("{base}/status") => ("200 OK", "application/json", status.lock().unwrap().clone()),
        ("POST", p) if p == format!("{base}/code") => {
            *status.lock().unwrap() = r#"{"step":"received"}"#.to_string();
            app.emit("relay-code", body.trim().to_string())?;
            ("200 OK", "application/json", r#"{"ok":true}"#.to_string())
        }
        _ => ("404 Not Found", "text/plain", "Introuvable".to_string()),
    };
    let response = format!(
        "HTTP/1.1 {code}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{content}",
        content.len()
    );
    conn.write_all(response.as_bytes()).await?;
    conn.shutdown().await?;
    Ok(())
}
