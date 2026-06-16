import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api";
import type { Collection, ImageRecord } from "./types";
import "./App.css";

function App() {
  const [vaultPath, setVaultPath] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState("Inbox");
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const pasteZoneRef = useRef<HTMLDivElement>(null);

  const activeCollection = collections.find((c) => c.id === activeCollectionId);
  const viewerImage = viewerIndex !== null ? images[viewerIndex] : null;

  const refreshCollections = useCallback(async () => {
    const data = await api.listCollections();
    setCollections(data);
  }, []);

  const refreshImages = useCallback(async (collectionId: string) => {
    const data = await api.listImages(collectionId);
    setImages(data);
  }, []);

  const refreshAll = useCallback(async () => {
    await refreshCollections();
    await refreshImages(activeCollectionId);
  }, [activeCollectionId, refreshCollections, refreshImages]);

  useEffect(() => {
    async function init() {
      try {
        const [path, defaultId] = await Promise.all([
          api.getVaultPath(),
          api.getDefaultCollectionId(),
        ]);
        setVaultPath(path);
        setActiveCollectionId(defaultId);
        await refreshCollections();
        await refreshImages(defaultId);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [refreshCollections, refreshImages]);

  useEffect(() => {
    if (!loading) {
      refreshImages(activeCollectionId);
      setViewerIndex(null);
    }
  }, [activeCollectionId, loading, refreshImages]);

  const showStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2500);
  };

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        const saved = await api.saveImageBytes(
          bytes,
          activeCollectionId,
          item.type,
        );
        await refreshAll();
        showStatus(`Đã lưu vào ${activeCollection?.name ?? activeCollectionId}`);
        setViewerIndex(0);
        void saved;
        return;
      }
    },
    [activeCollection?.name, activeCollectionId, images, refreshAll],
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (viewerIndex === null) return;
      const current = images[viewerIndex];
      if (!current) return;

      if (e.key === "Escape") {
        setViewerIndex(null);
      } else if (e.key === "ArrowLeft") {
        setViewerIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      } else if (e.key === "ArrowRight") {
        setViewerIndex((i) =>
          i !== null && i < images.length - 1 ? i + 1 : i,
        );
      } else if (e.key === "*") {
        void (async () => {
          await api.toggleStar(current.filename);
          await refreshAll();
        })();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, images, refreshAll]);

  async function handlePasteButton() {
    try {
      await api.pasteFromClipboard(activeCollectionId);
      await refreshAll();
      showStatus(`Đã paste vào ${activeCollection?.name ?? activeCollectionId}`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await api.createCollection(newCollectionName);
      setNewCollectionName("");
      setShowCreateModal(false);
      await refreshCollections();
      setActiveCollectionId(created.id);
      showStatus(`Đã tạo bộ sưu tập "${created.name}"`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleDeleteCollection(id: string) {
    if (!confirm(`Xóa bộ sưu tập "${id}" và toàn bộ ảnh bên trong?`)) return;
    try {
      await api.deleteCollection(id);
      if (activeCollectionId === id) {
        setActiveCollectionId("Inbox");
      }
      await refreshAll();
      showStatus("Đã xóa bộ sưu tập");
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleToggleStar(image: ImageRecord) {
    await api.toggleStar(image.filename);
    await refreshAll();
    showStatus(image.is_starred ? "Đã bỏ đánh dấu sao" : "Đã thêm vào ⭐ Đã đánh dấu");
  }

  async function handleAddToCollection(
    filename: string,
    collectionId: string,
  ) {
    try {
      await api.addToCollection(filename, collectionId);
      await refreshAll();
      showStatus("Đã thêm vào bộ sưu tập");
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleDeleteImage(filename: string) {
    if (!confirm("Xóa ảnh khỏi tất cả bộ sưu tập?")) return;
    await api.deleteImage(filename);
    setViewerIndex(null);
    await refreshAll();
    showStatus("Đã xóa ảnh");
  }

  async function handleOpenFolder(collectionId: string) {
    try {
      await api.openCollectionFolder(collectionId);
    } catch (err) {
      showStatus(String(err));
    }
  }

  if (loading) {
    return <div className="loading">Đang mở PhotoVault...</div>;
  }

  return (
    <div className="app" ref={pasteZoneRef} tabIndex={-1}>
      <aside className="sidebar">
        <div className="brand">
          <h1>PhotoVault</h1>
          <p className="vault-path" title={vaultPath}>
            {vaultPath}
          </p>
        </div>

        <button
          className="btn primary full"
          onClick={() => setShowCreateModal(true)}
        >
          + Bộ sưu tập mới
        </button>

        <nav className="collection-list">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className={`collection-item ${collection.id === activeCollectionId ? "active" : ""}`}
            >
              <button
                className="collection-btn"
                onClick={() => setActiveCollectionId(collection.id)}
              >
                <span>{collection.name}</span>
                <span className="count">{collection.image_count}</span>
              </button>
              <div className="collection-actions">
                <button
                  title="Mở folder"
                  onClick={() => handleOpenFolder(collection.id)}
                >
                  📁
                </button>
                {!collection.is_system && (
                  <button
                    title="Xóa"
                    onClick={() => handleDeleteCollection(collection.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div>
            <h2>{activeCollection?.name ?? activeCollectionId}</h2>
            <p>{images.length} ảnh · Ctrl+V để paste · ← → để xem</p>
          </div>
          <div className="toolbar-actions">
            <button className="btn" onClick={() => handleOpenFolder(activeCollectionId)}>
              Mở folder
            </button>
            <button className="btn primary" onClick={handlePasteButton}>
              Paste ảnh
            </button>
          </div>
        </header>

        {status && <div className="status-bar">{status}</div>}

        {images.length === 0 ? (
          <div className="empty">
            <p>Chưa có ảnh trong bộ sưu tập này.</p>
            <p>Chụp màn hình (Win+Shift+S) rồi nhấn Ctrl+V hoặc bấm Paste ảnh.</p>
          </div>
        ) : (
          <div className="gallery">
            {images.map((image, index) => (
              <button
                key={`${image.id}-${index}`}
                className="gallery-item"
                onClick={() => setViewerIndex(index)}
              >
                <img
                  src={convertFileSrc(image.file_path)}
                  alt={image.filename}
                  loading="lazy"
                />
                {image.is_starred && <span className="star-badge">★</span>}
              </button>
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateCollection}
          >
            <h3>Tạo bộ sưu tập mới</h3>
            <p>Ảnh sẽ được lưu trực tiếp vào folder này trên disk.</p>
            <input
              autoFocus
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="Tên bộ sưu tập..."
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setShowCreateModal(false)}>
                Hủy
              </button>
              <button type="submit" className="btn primary">
                Tạo
              </button>
            </div>
          </form>
        </div>
      )}

      {viewerImage && viewerIndex !== null && (
        <div className="viewer-backdrop" onClick={() => setViewerIndex(null)}>
          <div className="viewer" onClick={(e) => e.stopPropagation()}>
            <button
              className="nav-btn prev"
              disabled={viewerIndex === 0}
              onClick={() => setViewerIndex(viewerIndex - 1)}
            >
              ‹
            </button>

            <div className="viewer-content">
              <img
                src={convertFileSrc(viewerImage.file_path)}
                alt={viewerImage.filename}
              />
              <div className="viewer-meta">
                <span>
                  {viewerIndex + 1} / {images.length}
                </span>
                <span>{viewerImage.filename}</span>
                <span>{viewerImage.created_at}</span>
              </div>

              <div className="viewer-actions">
                <button
                  className={viewerImage.is_starred ? "active" : ""}
                  onClick={() => handleToggleStar(viewerImage)}
                >
                  {viewerImage.is_starred ? "★ Đã sao" : "☆ Đánh dấu sao"}
                </button>

                <select
                  defaultValue=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) {
                      void handleAddToCollection(viewerImage.filename, value);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">+ Thêm vào bộ sưu tập...</option>
                  {collections
                    .filter(
                      (c) =>
                        !c.is_system &&
                        !viewerImage.collection_ids.includes(c.id),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>

                <button
                  className="danger"
                  onClick={() => handleDeleteImage(viewerImage.filename)}
                >
                  Xóa ảnh
                </button>

                <button onClick={() => setViewerIndex(null)}>Đóng</button>
              </div>
            </div>

            <button
              className="nav-btn next"
              disabled={viewerIndex === images.length - 1}
              onClick={() => setViewerIndex(viewerIndex + 1)}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
