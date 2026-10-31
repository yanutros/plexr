// Pas de console supplémentaire sous Windows en build release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    plexr_lib::run()
}
