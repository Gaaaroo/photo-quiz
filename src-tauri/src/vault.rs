use chrono::{DateTime, Local};
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_VAULT_FOLDER: &str = "Default";
pub const INBOX_FOLDER: &str = "Inbox";
pub const STARRED_FOLDER: &str = "⭐ Đã đánh dấu";

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp"];

#[derive(Debug, Clone, serde::Serialize)]
pub struct VaultFolder {
    pub id: String,
    pub name: String,
    pub collection_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub is_system: bool,
    pub image_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImageRecord {
    pub id: String,
    pub filename: String,
    pub file_path: String,
    pub is_starred: bool,
    pub created_at: String,
    pub collection_ids: Vec<String>,
}

pub struct Vault {
    pub root: PathBuf,
}

impl Vault {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        Self::migrate_legacy_layout(&root)?;
        Self::ensure_default_vault_folder(&root)?;
        Ok(Self { root })
    }

    fn migrate_legacy_layout(root: &Path) -> Result<(), String> {
        if !root.join(INBOX_FOLDER).is_dir() {
            return Ok(());
        }

        let default_dir = root.join(DEFAULT_VAULT_FOLDER);
        fs::create_dir_all(&default_dir).map_err(|e| e.to_string())?;

        for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name == DEFAULT_VAULT_FOLDER {
                continue;
            }
            let target = default_dir.join(&name);
            if target.exists() {
                continue;
            }
            fs::rename(entry.path(), target).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    fn ensure_default_vault_folder(root: &Path) -> Result<(), String> {
        let vault = Vault { root: root.to_path_buf() };
        if vault.list_vault_folders()?.is_empty() {
            vault.create_vault_folder(DEFAULT_VAULT_FOLDER)?;
            vault.ensure_default_collections(DEFAULT_VAULT_FOLDER)?;
        }
        Ok(())
    }

    fn sanitize_name(name: &str, label: &str) -> Result<String, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(format!("Tên {label} không được để trống"));
        }
        if trimmed == "." || trimmed == ".." {
            return Err(format!("Tên {label} không hợp lệ"));
        }
        for ch in trimmed.chars() {
            if "<>:\"/\\|?*".contains(ch) {
                return Err(format!("Tên {label} chứa ký tự không hợp lệ"));
            }
        }
        Ok(trimmed.to_string())
    }

    fn is_system_collection(name: &str) -> bool {
        name == INBOX_FOLDER || name == STARRED_FOLDER
    }

    fn is_image_file(path: &Path) -> bool {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| {
                IMAGE_EXTENSIONS
                    .iter()
                    .any(|allowed| allowed.eq_ignore_ascii_case(ext))
            })
            .unwrap_or(false)
    }

    fn vault_folder_path(&self, vault_folder_id: &str) -> PathBuf {
        self.root.join(vault_folder_id)
    }

    fn collection_path(&self, vault_folder_id: &str, collection_id: &str) -> PathBuf {
        self.vault_folder_path(vault_folder_id)
            .join(collection_id)
    }

    fn ensure_default_collections(&self, vault_folder_id: &str) -> Result<(), String> {
        fs::create_dir_all(self.collection_path(vault_folder_id, INBOX_FOLDER))
            .map_err(|e| e.to_string())?;
        fs::create_dir_all(self.collection_path(vault_folder_id, STARRED_FOLDER))
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn count_images_in_dir(&self, dir: &Path) -> Result<i64, String> {
        if !dir.is_dir() {
            return Ok(0);
        }
        let count = fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| entry.ok())
            .filter(|entry| Self::is_image_file(&entry.path()))
            .count() as i64;
        Ok(count)
    }

    fn count_collections_in_vault_folder(&self, vault_folder_id: &str) -> Result<i64, String> {
        let dir = self.vault_folder_path(vault_folder_id);
        if !dir.is_dir() {
            return Ok(0);
        }
        let count = fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .count() as i64;
        Ok(count)
    }

    pub fn list_vault_folders(&self) -> Result<Vec<VaultFolder>, String> {
        let mut folders = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            folders.push(VaultFolder {
                id: name.clone(),
                name,
                collection_count: self.count_collections_in_vault_folder(&entry.file_name().to_string_lossy())?,
            });
        }
        folders.sort_by(|a, b| {
            if a.id == DEFAULT_VAULT_FOLDER {
                std::cmp::Ordering::Less
            } else if b.id == DEFAULT_VAULT_FOLDER {
                std::cmp::Ordering::Greater
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });
        Ok(folders)
    }

    pub fn create_vault_folder(&self, name: &str) -> Result<VaultFolder, String> {
        let folder_name = Self::sanitize_name(name, "folder")?;
        let dir = self.vault_folder_path(&folder_name);
        if dir.exists() {
            return Err("Folder này đã tồn tại".into());
        }
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(VaultFolder {
            id: folder_name.clone(),
            name: folder_name.clone(),
            collection_count: self.count_collections_in_vault_folder(&folder_name)?,
        })
    }

    pub fn delete_vault_folder(&self, vault_folder_id: &str) -> Result<(), String> {
        if vault_folder_id == DEFAULT_VAULT_FOLDER {
            return Err("Không thể xóa folder mặc định".into());
        }
        let dir = self.vault_folder_path(vault_folder_id);
        if !dir.is_dir() {
            return Err("Folder không tồn tại".into());
        }
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn rename_vault_folder(
        &self,
        vault_folder_id: &str,
        new_name: &str,
    ) -> Result<VaultFolder, String> {
        let folder_name = Self::sanitize_name(new_name, "folder")?;
        let from = self.vault_folder_path(vault_folder_id);
        if !from.is_dir() {
            return Err("Folder không tồn tại".into());
        }

        if vault_folder_id == folder_name {
            return Ok(VaultFolder {
                id: folder_name.clone(),
                name: folder_name,
                collection_count: self.count_collections_in_vault_folder(vault_folder_id)?,
            });
        }

        let to = self.vault_folder_path(&folder_name);
        if to.exists() {
            return Err("Folder này đã tồn tại".into());
        }

        fs::rename(&from, &to).map_err(|e| e.to_string())?;

        Ok(VaultFolder {
            id: folder_name.clone(),
            name: folder_name.clone(),
            collection_count: self.count_collections_in_vault_folder(&folder_name)?,
        })
    }

    pub fn list_collections(&self, vault_folder_id: &str) -> Result<Vec<Collection>, String> {
        let vault_dir = self.vault_folder_path(vault_folder_id);
        if !vault_dir.is_dir() {
            return Err("Folder không tồn tại".into());
        }

        if vault_folder_id == DEFAULT_VAULT_FOLDER {
            self.ensure_default_collections(vault_folder_id)?;
        }

        let mut collections = Vec::new();
        for name in [INBOX_FOLDER, STARRED_FOLDER] {
            let dir = self.collection_path(vault_folder_id, name);
            if !dir.is_dir() {
                continue;
            }
            collections.push(Collection {
                id: name.to_string(),
                name: name.to_string(),
                is_system: true,
                image_count: self.count_images_in_dir(&dir)?,
            });
        }

        let mut custom = Vec::new();
        for entry in fs::read_dir(&vault_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if Self::is_system_collection(&name) {
                continue;
            }
            custom.push(Collection {
                id: name.clone(),
                name,
                is_system: false,
                image_count: self.count_images_in_dir(&entry.path())?,
            });
        }

        custom.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        collections.extend(custom);
        Ok(collections)
    }

    pub fn create_collection(
        &self,
        vault_folder_id: &str,
        name: &str,
    ) -> Result<Collection, String> {
        let folder_name = Self::sanitize_name(name, "bộ sưu tập")?;
        if Self::is_system_collection(&folder_name) {
            return Err("Tên bộ sưu tập này đã được dùng".into());
        }

        let dir = self.collection_path(vault_folder_id, &folder_name);
        if !self.vault_folder_path(vault_folder_id).is_dir() {
            return Err("Folder không tồn tại".into());
        }
        if dir.exists() {
            return Err("Bộ sưu tập này đã tồn tại trong folder".into());
        }

        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        Ok(Collection {
            id: folder_name.clone(),
            name: folder_name,
            is_system: false,
            image_count: 0,
        })
    }

    pub fn delete_collection(
        &self,
        vault_folder_id: &str,
        collection_id: &str,
    ) -> Result<(), String> {
        if Self::is_system_collection(collection_id) {
            return Err("Không thể xóa bộ sưu tập hệ thống".into());
        }

        let dir = self.collection_path(vault_folder_id, collection_id);
        if !dir.exists() {
            return Err("Bộ sưu tập không tồn tại".into());
        }

        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn rename_collection(
        &self,
        vault_folder_id: &str,
        collection_id: &str,
        new_name: &str,
    ) -> Result<Collection, String> {
        if Self::is_system_collection(collection_id) {
            return Err("Không thể đổi tên bộ sưu tập hệ thống".into());
        }

        let folder_name = Self::sanitize_name(new_name, "bộ sưu tập")?;
        if Self::is_system_collection(&folder_name) {
            return Err("Tên bộ sưu tập này đã được dùng".into());
        }

        let from = self.collection_path(vault_folder_id, collection_id);
        if !from.is_dir() {
            return Err("Bộ sưu tập không tồn tại".into());
        }

        if collection_id == folder_name {
            return Ok(Collection {
                id: folder_name.clone(),
                name: folder_name,
                is_system: false,
                image_count: self.count_images_in_dir(&from)?,
            });
        }

        let to = self.collection_path(vault_folder_id, &folder_name);
        if to.exists() {
            return Err("Bộ sưu tập này đã tồn tại trong folder".into());
        }

        fs::rename(&from, &to).map_err(|e| e.to_string())?;

        Ok(Collection {
            id: folder_name.clone(),
            name: folder_name,
            is_system: false,
            image_count: self.count_images_in_dir(&to)?,
        })
    }

    fn file_created_at(path: &Path) -> String {
        fs::metadata(path)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| {
                DateTime::<Local>::from(time)
                    .format("%Y-%m-%d %H:%M:%S")
                    .to_string()
                    .into()
            })
            .unwrap_or_else(|| "Unknown".to_string())
    }

    fn collections_containing_filename(
        &self,
        vault_folder_id: &str,
        filename: &str,
    ) -> Result<Vec<String>, String> {
        let vault_dir = self.vault_folder_path(vault_folder_id);
        let mut ids = Vec::new();
        for entry in fs::read_dir(&vault_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            let folder_name = entry.file_name().to_string_lossy().to_string();
            let candidate = entry.path().join(filename);
            if candidate.is_file() && Self::is_image_file(&candidate) {
                ids.push(folder_name);
            }
        }
        ids.sort();
        Ok(ids)
    }

    fn is_starred_filename(&self, vault_folder_id: &str, filename: &str) -> bool {
        self.collection_path(vault_folder_id, STARRED_FOLDER)
            .join(filename)
            .is_file()
    }

    fn find_source_path(
        &self,
        vault_folder_id: &str,
        filename: &str,
    ) -> Result<PathBuf, String> {
        for collection_id in
            self.collections_containing_filename(vault_folder_id, filename)?
        {
            let path = self
                .collection_path(vault_folder_id, &collection_id)
                .join(filename);
            if path.is_file() {
                return Ok(path);
            }
        }
        Err("Không tìm thấy ảnh".into())
    }

    pub fn list_images_in_collection(
        &self,
        vault_folder_id: &str,
        collection_id: &str,
    ) -> Result<Vec<ImageRecord>, String> {
        let dir = self.collection_path(vault_folder_id, collection_id);
        if !dir.is_dir() {
            return Err("Bộ sưu tập không tồn tại".into());
        }

        let mut images = Vec::new();
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !Self::is_image_file(&path) {
                continue;
            }

            let filename = entry.file_name().to_string_lossy().to_string();
            let collection_ids =
                self.collections_containing_filename(vault_folder_id, &filename)?;
            images.push(ImageRecord {
                id: filename.clone(),
                filename: filename.clone(),
                file_path: path.to_string_lossy().to_string(),
                is_starred: self.is_starred_filename(vault_folder_id, &filename),
                created_at: Self::file_created_at(&path),
                collection_ids,
            });
        }

        images.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(images)
    }

    fn make_filename(mime_type: &str) -> String {
        let now = Local::now().format("%Y%m%d_%H%M%S");
        let short_id = &uuid::Uuid::new_v4().to_string()[..8];
        let ext = match mime_type {
            "image/jpeg" | "image/jpg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            "image/bmp" => "bmp",
            _ => "png",
        };
        format!("{now}_{short_id}.{ext}")
    }

    pub fn save_bytes_to_collection(
        &self,
        vault_folder_id: &str,
        bytes: &[u8],
        collection_id: &str,
        mime_type: &str,
    ) -> Result<ImageRecord, String> {
        if bytes.is_empty() {
            return Err("Không có dữ liệu ảnh".into());
        }

        let dir = self.collection_path(vault_folder_id, collection_id);
        if !dir.is_dir() {
            return Err("Bộ sưu tập không tồn tại".into());
        }

        let filename = Self::make_filename(mime_type);
        let file_path = dir.join(&filename);
        fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

        Ok(ImageRecord {
            id: filename.clone(),
            file_path: file_path.to_string_lossy().to_string(),
            filename,
            is_starred: false,
            created_at: Self::file_created_at(&file_path),
            collection_ids: vec![collection_id.to_string()],
        })
    }

    fn link_or_copy(from: &Path, to: &Path) -> Result<(), String> {
        if to.exists() {
            return Ok(());
        }
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if fs::hard_link(from, to).is_err() {
            fs::copy(from, to).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn toggle_star(
        &self,
        vault_folder_id: &str,
        filename: &str,
    ) -> Result<ImageRecord, String> {
        let source = self.find_source_path(vault_folder_id, filename)?;
        let starred_path = self
            .collection_path(vault_folder_id, STARRED_FOLDER)
            .join(filename);

        if starred_path.is_file() {
            fs::remove_file(&starred_path).map_err(|e| e.to_string())?;
        } else {
            Self::link_or_copy(&source, &starred_path)?;
        }

        self.build_image_record(vault_folder_id, &source, filename)
    }

    pub fn add_to_collection(
        &self,
        vault_folder_id: &str,
        filename: &str,
        collection_id: &str,
    ) -> Result<ImageRecord, String> {
        if collection_id == STARRED_FOLDER {
            return self.toggle_star(vault_folder_id, filename);
        }

        let source = self.find_source_path(vault_folder_id, filename)?;
        let target = self
            .collection_path(vault_folder_id, collection_id)
            .join(filename);

        if !self.collection_path(vault_folder_id, collection_id).is_dir() {
            return Err("Bộ sưu tập không tồn tại".into());
        }

        Self::link_or_copy(&source, &target)?;
        self.build_image_record(vault_folder_id, &source, filename)
    }

    pub fn remove_from_collection(
        &self,
        vault_folder_id: &str,
        filename: &str,
        collection_id: &str,
    ) -> Result<ImageRecord, String> {
        if collection_id == STARRED_FOLDER {
            let starred_path = self
                .collection_path(vault_folder_id, STARRED_FOLDER)
                .join(filename);
            if starred_path.is_file() {
                fs::remove_file(&starred_path).map_err(|e| e.to_string())?;
            }
            let source = self.find_source_path(vault_folder_id, filename)?;
            return self.build_image_record(vault_folder_id, &source, filename);
        }

        if collection_id == INBOX_FOLDER {
            return Err("Không thể gỡ ảnh khỏi Inbox. Hãy xóa ảnh nếu không cần.".into());
        }

        let path = self
            .collection_path(vault_folder_id, collection_id)
            .join(filename);
        if path.is_file() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }

        let source = self.find_source_path(vault_folder_id, filename)?;
        self.build_image_record(vault_folder_id, &source, filename)
    }

    pub fn delete_image(&self, vault_folder_id: &str, filename: &str) -> Result<(), String> {
        let collection_ids =
            self.collections_containing_filename(vault_folder_id, filename)?;
        if collection_ids.is_empty() {
            return Err("Không tìm thấy ảnh".into());
        }

        for collection_id in collection_ids {
            let path = self
                .collection_path(vault_folder_id, &collection_id)
                .join(filename);
            if path.is_file() {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    fn build_image_record(
        &self,
        vault_folder_id: &str,
        source: &Path,
        filename: &str,
    ) -> Result<ImageRecord, String> {
        Ok(ImageRecord {
            id: filename.to_string(),
            filename: filename.to_string(),
            file_path: source.to_string_lossy().to_string(),
            is_starred: self.is_starred_filename(vault_folder_id, filename),
            created_at: Self::file_created_at(source),
            collection_ids: self.collections_containing_filename(vault_folder_id, filename)?,
        })
    }

    pub fn open_vault_folder_in_explorer(&self, vault_folder_id: &str) -> Result<(), String> {
        let dir = self.vault_folder_path(vault_folder_id);
        if !dir.is_dir() {
            return Err("Folder không tồn tại".into());
        }
        open::that(&dir).map_err(|e| e.to_string())
    }

    pub fn open_collection_in_explorer(
        &self,
        vault_folder_id: &str,
        collection_id: &str,
    ) -> Result<(), String> {
        let dir = self.collection_path(vault_folder_id, collection_id);
        if !dir.is_dir() {
            return Err("Bộ sưu tập không tồn tại".into());
        }
        open::that(&dir).map_err(|e| e.to_string())
    }
}
