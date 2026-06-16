mod vault;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use vault::{Collection, ImageRecord, Vault, VaultFolder, DEFAULT_VAULT_FOLDER, INBOX_FOLDER};

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
fn list_vault_folders(state: State<AppState>) -> Result<Vec<VaultFolder>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.list_vault_folders()
}

#[tauri::command]
fn create_vault_folder(name: String, state: State<AppState>) -> Result<VaultFolder, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.create_vault_folder(&name)
}

#[tauri::command]
fn delete_vault_folder(vault_folder_id: String, state: State<AppState>) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_vault_folder(&vault_folder_id)
}

#[tauri::command]
fn rename_vault_folder(
    vault_folder_id: String,
    new_name: String,
    state: State<AppState>,
) -> Result<VaultFolder, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.rename_vault_folder(&vault_folder_id, &new_name)
}

#[tauri::command]
fn list_collections(
    vault_folder_id: String,
    state: State<AppState>,
) -> Result<Vec<Collection>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.list_collections(&vault_folder_id)
}

#[tauri::command]
fn create_collection(
    vault_folder_id: String,
    name: String,
    state: State<AppState>,
) -> Result<Collection, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.create_collection(&vault_folder_id, &name)
}

#[tauri::command]
fn delete_collection(
    vault_folder_id: String,
    collection_id: String,
    state: State<AppState>,
) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_collection(&vault_folder_id, &collection_id)
}

#[tauri::command]
fn rename_collection(
    vault_folder_id: String,
    collection_id: String,
    new_name: String,
    state: State<AppState>,
) -> Result<Collection, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.rename_collection(&vault_folder_id, &collection_id, &new_name)
}

#[tauri::command]
fn list_images(
    vault_folder_id: String,
    collection_id: String,
    state: State<AppState>,
) -> Result<Vec<ImageRecord>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.list_images_in_collection(&vault_folder_id, &collection_id)
}

#[tauri::command]
fn save_image_bytes(
    vault_folder_id: String,
    bytes: Vec<u8>,
    collection_id: String,
    mime_type: Option<String>,
    state: State<AppState>,
) -> Result<ImageRecord, String> {
    let mime = mime_type.unwrap_or_else(|| "image/png".to_string());
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.save_bytes_to_collection(&vault_folder_id, &bytes, &collection_id, &mime)
}

#[tauri::command]
fn paste_from_clipboard(
    vault_folder_id: String,
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
    vault.save_bytes_to_collection(&vault_folder_id, &png_bytes, &collection_id, "image/png")
}

#[tauri::command]
fn toggle_star(
    vault_folder_id: String,
    filename: String,
    state: State<AppState>,
) -> Result<ImageRecord, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.toggle_star(&vault_folder_id, &filename)
}

#[tauri::command]
fn add_to_collection(
    vault_folder_id: String,
    filename: String,
    collection_id: String,
    state: State<AppState>,
) -> Result<ImageRecord, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.add_to_collection(&vault_folder_id, &filename, &collection_id)
}

#[tauri::command]
fn remove_from_collection(
    vault_folder_id: String,
    filename: String,
    collection_id: String,
    state: State<AppState>,
) -> Result<ImageRecord, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.remove_from_collection(&vault_folder_id, &filename, &collection_id)
}

#[tauri::command]
fn delete_image(
    vault_folder_id: String,
    filename: String,
    state: State<AppState>,
) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_image(&vault_folder_id, &filename)
}

#[tauri::command]
fn get_default_vault_folder_id() -> String {
    DEFAULT_VAULT_FOLDER.to_string()
}

#[tauri::command]
fn get_default_collection_id() -> String {
    INBOX_FOLDER.to_string()
}

#[tauri::command]
fn open_vault_folder(vault_folder_id: String, state: State<AppState>) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.open_vault_folder_in_explorer(&vault_folder_id)
}

#[tauri::command]
fn open_collection_folder(
    vault_folder_id: String,
    collection_id: String,
    state: State<AppState>,
) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.open_collection_in_explorer(&vault_folder_id, &collection_id)
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
            list_vault_folders,
            create_vault_folder,
            delete_vault_folder,
            rename_vault_folder,
            list_collections,
            create_collection,
            delete_collection,
            rename_collection,
            list_images,
            save_image_bytes,
            paste_from_clipboard,
            toggle_star,
            add_to_collection,
            remove_from_collection,
            delete_image,
            get_default_vault_folder_id,
            get_default_collection_id,
            open_vault_folder,
            open_collection_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
