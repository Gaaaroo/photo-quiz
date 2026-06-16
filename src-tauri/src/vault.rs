use chrono::{DateTime, Local};
use std::fs;
use std::path::{Path, PathBuf};

pub const INBOX_FOLDER: &str = "Inbox";
pub const STARRED_FOLDER: &str = "⭐ Đã đánh dấu";

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp"];

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
        fs::create_dir_all(root.join(INBOX_FOLDER)).map_err(|e| e.to_string())?;
        fs::create_dir_all(root.join(STARRED_FOLDER)).map_err(|e| e.to_string())?;
        Ok(Self { root })
    }

    fn collection_path(&self, collection_id: &str) -> PathBuf {
        self.root.join(collection_id)
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

    fn sanitize_collection_name(name: &str) -> Result<String, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Tên bộ sưu tập không được để trống".into());
        }
        if trimmed == "." || trimmed == ".." {
            return Err("Tên bộ sưu tập không hợp lệ".into());
        }
        for ch in trimmed.chars() {
            if "<>:\"/\\|?*".contains(ch) {
                return Err("Tên bộ sưu tập chứa ký tự không hợp lệ".into());
            }
        }
        Ok(trimmed.to_string())
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

    pub fn list_collections(&self) -> Result<Vec<Collection>, String> {
        let mut collections = Vec::new();

        for name in [INBOX_FOLDER, STARRED_FOLDER] {
            let dir = self.collection_path(name);
            collections.push(Collection {
                id: name.to_string(),
                name: name.to_string(),
                is_system: true,
                image_count: self.count_images_in_dir(&dir)?,
            });
        }

        let mut custom = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(|e| e.to_string())? {
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

    pub fn create_collection(&self, name: &str) -> Result<Collection, String> {
        let folder_name = Self::sanitize_collection_name(name)?;
        if Self::is_system_collection(&folder_name) {
            return Err("Tên bộ sưu tập này đã được dùng".into());
        }

        let dir = self.collection_path(&folder_name);
        if dir.exists() {
            return Err("Bộ sưu tập này đã tồn tại".into());
        }

        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        Ok(Collection {
            id: folder_name.clone(),
            name: folder_name,
            is_system: false,
            image_count: 0,
        })
    }

    pub fn delete_collection(&self, collection_id: &str) -> Result<(), String> {
        if Self::is_system_collection(collection_id) {
            return Err("Không thể xóa bộ sưu tập hệ thống".into());
        }

        let dir = self.collection_path(collection_id);
        if !dir.exists() {
            return Err("Bộ sưu tập không tồn tại".into());
        }

        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(())
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

    fn collections_containing_filename(&self, filename: &str) -> Result<Vec<String>, String> {
        let mut ids = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(|e| e.to_string())? {
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

    fn is_starred_filename(&self, filename: &str) -> bool {
        self.collection_path(STARRED_FOLDER)
            .join(filename)
            .is_file()
    }

    fn find_source_path(&self, filename: &str) -> Result<PathBuf, String> {
        for collection_id in self.collections_containing_filename(filename)? {
            let path = self.collection_path(&collection_id).join(filename);
            if path.is_file() {
                return Ok(path);
            }
        }
        Err("Không tìm thấy ảnh".into())
    }

    pub fn list_images_in_collection(&self, collection_id: &str) -> Result<Vec<ImageRecord>, String> {
        let dir = self.collection_path(collection_id);
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
            let collection_ids = self.collections_containing_filename(&filename)?;
            images.push(ImageRecord {
                id: filename.clone(),
                filename: filename.clone(),
                file_path: path.to_string_lossy().to_string(),
                is_starred: self.is_starred_filename(&filename),
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
        bytes: &[u8],
        collection_id: &str,
        mime_type: &str,
    ) -> Result<ImageRecord, String> {
        if bytes.is_empty() {
            return Err("Không có dữ liệu ảnh".into());
        }

        let dir = self.collection_path(collection_id);
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

    pub fn toggle_star(&self, filename: &str) -> Result<ImageRecord, String> {
        let source = self.find_source_path(filename)?;
        let starred_path = self.collection_path(STARRED_FOLDER).join(filename);

        if starred_path.is_file() {
            fs::remove_file(&starred_path).map_err(|e| e.to_string())?;
        } else {
            Self::link_or_copy(&source, &starred_path)?;
        }

        self.build_image_record(&source, filename)
    }

    pub fn add_to_collection(&self, filename: &str, collection_id: &str) -> Result<ImageRecord, String> {
        if collection_id == STARRED_FOLDER {
            return self.toggle_star(filename);
        }

        let source = self.find_source_path(filename)?;
        let target = self.collection_path(collection_id).join(filename);

        if !self.collection_path(collection_id).is_dir() {
            return Err("Bộ sưu tập không tồn tại".into());
        }

        Self::link_or_copy(&source, &target)?;
        self.build_image_record(&source, filename)
    }

    pub fn remove_from_collection(
        &self,
        filename: &str,
        collection_id: &str,
    ) -> Result<ImageRecord, String> {
        if collection_id == STARRED_FOLDER {
            let starred_path = self.collection_path(STARRED_FOLDER).join(filename);
            if starred_path.is_file() {
                fs::remove_file(&starred_path).map_err(|e| e.to_string())?;
            }
            let source = self.find_source_path(filename)?;
            return self.build_image_record(&source, filename);
        }

        if collection_id == INBOX_FOLDER {
            return Err("Không thể gỡ ảnh khỏi Inbox. Hãy xóa ảnh nếu không cần.".into());
        }

        let path = self.collection_path(collection_id).join(filename);
        if path.is_file() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }

        let source = self.find_source_path(filename)?;
        self.build_image_record(&source, filename)
    }

    pub fn delete_image(&self, filename: &str) -> Result<(), String> {
        let collection_ids = self.collections_containing_filename(filename)?;
        if collection_ids.is_empty() {
            return Err("Không tìm thấy ảnh".into());
        }

        for collection_id in collection_ids {
            let path = self.collection_path(&collection_id).join(filename);
            if path.is_file() {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    fn build_image_record(&self, source: &Path, filename: &str) -> Result<ImageRecord, String> {
        Ok(ImageRecord {
            id: filename.to_string(),
            filename: filename.to_string(),
            file_path: source.to_string_lossy().to_string(),
            is_starred: self.is_starred_filename(filename),
            created_at: Self::file_created_at(source),
            collection_ids: self.collections_containing_filename(filename)?,
        })
    }

    pub fn open_collection_in_explorer(&self, collection_id: &str) -> Result<(), String> {
        let dir = self.collection_path(collection_id);
        if !dir.is_dir() {
            return Err("Bộ sưu tập không tồn tại".into());
        }
        open::that(&dir).map_err(|e| e.to_string())
    }
}
