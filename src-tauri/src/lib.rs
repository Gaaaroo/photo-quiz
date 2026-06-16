mod vault;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use vault::{Collection, ImageRecord, Vault, INBOX_FOLDER};

pub struct AppState {
    pub vault: Mutex<Vault>,
}

fn default_vault_path() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PhotoVault")
}

#[tauri::command]
fn get_vault_path(state: State<AppState>) -> Result<String, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.root.to_string_lossy().to_string())
}

#[tauri::command]
fn list_collections(state: State<AppState>) -> Result<Vec<Collection>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.list_collections()
}

#[tauri::command]
fn create_collection(name: String, state: State<AppState>) -> Result<Collection, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.create_collection(&name)
}

#[tauri::command]
fn delete_collection(collection_id: String, state: State<AppState>) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_collection(&collection_id)
}

#[tauri::command]
fn list_images(collection_id: String, state: State<AppState>) -> Result<Vec<ImageRecord>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.list_images_in_collection(&collection_id)
}

#[tauri::command]
fn save_image_bytes(
    bytes: Vec<u8>,
    collection_id: String,
    mime_type: Option<String>,
    state: State<AppState>,
) -> Result<ImageRecord, String> {
    let mime = mime_type.unwrap_or_else(|| "image/png".to_string());
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.save_bytes_to_collection(&bytes, &collection_id, &mime)
}

#[tauri::command]
fn paste_from_clipboard(
    collection_id: String,
    state: State<AppState>,
) -> Result<ImageRecord, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let image = clipboard
        .get_image()
        .map_err(|_| "Clipboard không có ảnh. Hãy chụp màn hình hoặc copy ảnh trước.".to_string())?;

    let width = image.width as u32;
    let height = image.height as u32;
    let rgba = image.bytes.into_owned();
    let img = image::RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| "Không thể đọc ảnh từ clipboard".to_string())?;

    let mut png_bytes: Vec<u8> = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut png_bytes);
        img.write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
    }

    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.save_bytes_to_collection(&png_bytes, &collection_id, "image/png")
}

#[tauri::command]
fn toggle_star(filename: String, state: State<AppState>) -> Result<ImageRecord, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.toggle_star(&filename)
}

#[tauri::command]
fn add_to_collection(
    filename: String,
    collection_id: String,
    state: State<AppState>,
) -> Result<ImageRecord, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.add_to_collection(&filename, &collection_id)
}

#[tauri::command]
fn remove_from_collection(
    filename: String,
    collection_id: String,
    state: State<AppState>,
) -> Result<ImageRecord, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.remove_from_collection(&filename, &collection_id)
}

#[tauri::command]
fn delete_image(filename: String, state: State<AppState>) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_image(&filename)
}

#[tauri::command]
fn get_default_collection_id() -> String {
    INBOX_FOLDER.to_string()
}

#[tauri::command]
fn open_collection_folder(collection_id: String, state: State<AppState>) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.open_collection_in_explorer(&collection_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vault_path = default_vault_path();
    let vault = Vault::open(vault_path).expect("Failed to initialize photo vault");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            vault: Mutex::new(vault),
        })
        .invoke_handler(tauri::generate_handler![
            get_vault_path,
            list_collections,
            create_collection,
            delete_collection,
            list_images,
            save_image_bytes,
            paste_from_clipboard,
            toggle_star,
            add_to_collection,
            remove_from_collection,
            delete_image,
            get_default_collection_id,
            open_collection_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
