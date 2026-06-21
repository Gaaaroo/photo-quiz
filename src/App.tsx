import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api";
import type { Collection, ImageRecord, VaultFolder } from "./types";
import "./App.css";

function App() {
  const [vaultPath, setVaultPath] = useState("");
  const [vaultFolders, setVaultFolders] = useState<VaultFolder[]>([]);
  const [activeVaultFolderId, setActiveVaultFolderId] = useState("Default");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState("Inbox");
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newVaultFolderName, setNewVaultFolderName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateVaultFolderModal, setShowCreateVaultFolderModal] =
    useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(
    () => new Set(),
  );
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const imageStageRef = useRef<HTMLDivElement>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 });
  const panDragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.25;

  const clampZoom = (value: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const resetViewerTransform = useCallback(() => {
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });
  }, []);

  const changeZoom = useCallback((delta: number) => {
    setViewerZoom((current) => {
      const next = clampZoom(Number((current + delta).toFixed(2)));
      if (next <= 1) {
        setViewerPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const activeVaultFolder = vaultFolders.find(
    (folder) => folder.id === activeVaultFolderId,
  );
  const activeCollection = collections.find((c) => c.id === activeCollectionId);
  const viewerImage = viewerIndex !== null ? images[viewerIndex] : null;
  const selectedCount = selectedFilenames.size;
  const allSelected =
    images.length > 0 && selectedCount === images.length;

  const toggleSelect = (filename: string) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedFilenames(new Set());
      return;
    }
    setSelectedFilenames(new Set(images.map((image) => image.filename)));
  };

  const clearSelection = () => setSelectedFilenames(new Set());

  const refreshVaultFolders = useCallback(async () => {
    const data = await api.listVaultFolders();
    setVaultFolders(data);
  }, []);

  const refreshCollections = useCallback(async (vaultFolderId: string) => {
    const data = await api.listCollections(vaultFolderId);
    setCollections(data);
  }, []);

  const refreshImages = useCallback(
    async (vaultFolderId: string, collectionId: string) => {
      const data = await api.listImages(vaultFolderId, collectionId);
      setImages(data);
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    await refreshVaultFolders();
    await refreshCollections(activeVaultFolderId);
    await refreshImages(activeVaultFolderId, activeCollectionId);
  }, [
    activeVaultFolderId,
    activeCollectionId,
    refreshVaultFolders,
    refreshCollections,
    refreshImages,
  ]);

  useEffect(() => {
    async function init() {
      try {
        const [path, defaultVaultFolderId, defaultCollectionId] =
          await Promise.all([
            api.getVaultPath(),
            api.getDefaultVaultFolderId(),
            api.getDefaultCollectionId(),
          ]);
        setVaultPath(path);
        setActiveVaultFolderId(defaultVaultFolderId);
        setActiveCollectionId(defaultCollectionId);
        await refreshVaultFolders();
        await refreshCollections(defaultVaultFolderId);
        await refreshImages(defaultVaultFolderId, defaultCollectionId);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [refreshCollections, refreshImages, refreshVaultFolders]);

  useEffect(() => {
    if (!loading) {
      refreshCollections(activeVaultFolderId);
      setActiveCollectionId("Inbox");
      setViewerIndex(null);
      clearSelection();
    }
  }, [activeVaultFolderId, loading, refreshCollections]);

  useEffect(() => {
    if (!loading) {
      refreshImages(activeVaultFolderId, activeCollectionId);
      setViewerIndex(null);
      clearSelection();
    }
  }, [activeCollectionId, activeVaultFolderId, loading, refreshImages]);

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
          activeVaultFolderId,
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
    [activeCollection?.name, activeCollectionId, activeVaultFolderId, images, refreshAll],
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  useEffect(() => {
    resetViewerTransform();
  }, [viewerIndex, resetViewerTransform]);

  useEffect(() => {
    const stage = imageStageRef.current;
    if (!stage || viewerIndex === null) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setViewerZoom((current) => {
        const next = clampZoom(Number((current + delta).toFixed(2)));
        if (next <= 1) {
          setViewerPan({ x: 0, y: 0 });
        }
        return next;
      });
    }

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [viewerIndex]);

  useEffect(() => {
    if (viewerIndex === null) return;

    function onMouseMove(e: MouseEvent) {
      if (!panDragRef.current.active) return;
      setViewerPan({
        x: panDragRef.current.panX + (e.clientX - panDragRef.current.startX),
        y: panDragRef.current.panY + (e.clientY - panDragRef.current.startY),
      });
    }

    function onMouseUp() {
      panDragRef.current.active = false;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [viewerIndex]);

  function handleImagePanStart(e: React.MouseEvent) {
    if (viewerZoom <= 1 || e.button !== 0) return;
    panDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: viewerPan.x,
      panY: viewerPan.y,
    };
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (viewerIndex === null) return;
      const current = images[viewerIndex];
      if (!current) return;

      if (e.key === "Escape") {
        setViewerIndex(null);
      } else if (e.key === "ArrowLeft" && viewerZoom <= 1) {
        setViewerIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      } else if (e.key === "ArrowRight" && viewerZoom <= 1) {
        setViewerIndex((i) =>
          i !== null && i < images.length - 1 ? i + 1 : i,
        );
      } else if (e.key === "+" || e.key === "=") {
        changeZoom(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        changeZoom(-ZOOM_STEP);
      } else if (e.key === "0") {
        resetViewerTransform();
      } else if (e.key === "*") {
        void (async () => {
          await api.toggleStar(activeVaultFolderId, current.filename);
          await refreshAll();
        })();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, images, refreshAll, viewerZoom, changeZoom, resetViewerTransform, activeVaultFolderId]);

  async function handlePasteButton() {
    try {
      await api.pasteFromClipboard(activeVaultFolderId, activeCollectionId);
      await refreshAll();
      showStatus(`Đã paste vào ${activeCollection?.name ?? activeCollectionId}`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await api.createCollection(activeVaultFolderId, newCollectionName);
      setNewCollectionName("");
      setShowCreateModal(false);
      await refreshCollections(activeVaultFolderId);
      setActiveCollectionId(created.id);
      showStatus(`Đã tạo bộ sưu tập "${created.name}"`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleDeleteCollection(id: string) {
    if (
      !confirm(
        `Xóa bộ sưu tập "${id}" và toàn bộ ảnh bên trong folder "${activeVaultFolder?.name ?? activeVaultFolderId}"?`,
      )
    ) {
      return;
    }
    try {
      await api.deleteCollection(activeVaultFolderId, id);
      if (activeCollectionId === id) {
        setActiveCollectionId("Inbox");
      }
      await refreshAll();
      showStatus("Đã xóa bộ sưu tập");
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleRenameVaultFolder(id: string, currentName: string) {
    const newName = prompt("Tên folder mới:", currentName);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === currentName) return;
    try {
      const renamed = await api.renameVaultFolder(id, trimmed);
      if (activeVaultFolderId === id) {
        setActiveVaultFolderId(renamed.id);
      }
      await refreshVaultFolders();
      showStatus(`Đã đổi tên folder thành "${renamed.name}"`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleRenameCollection(id: string, currentName: string) {
    const newName = prompt("Tên bộ sưu tập mới:", currentName);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === currentName) return;
    try {
      const renamed = await api.renameCollection(
        activeVaultFolderId,
        id,
        trimmed,
      );
      if (activeCollectionId === id) {
        setActiveCollectionId(renamed.id);
      }
      await refreshAll();
      showStatus(`Đã đổi tên bộ sưu tập thành "${renamed.name}"`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleCreateVaultFolder(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await api.createVaultFolder(newVaultFolderName);
      setNewVaultFolderName("");
      setShowCreateVaultFolderModal(false);
      await refreshVaultFolders();
      setActiveVaultFolderId(created.id);
      showStatus(`Đã tạo folder "${created.name}"`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleDeleteVaultFolder(id: string) {
    if (
      !confirm(
        `Xóa folder "${id}" và toàn bộ bộ sưu tập + ảnh bên trong?`,
      )
    ) {
      return;
    }
    try {
      await api.deleteVaultFolder(id);
      if (activeVaultFolderId === id) {
        setActiveVaultFolderId("Default");
      }
      await refreshVaultFolders();
      showStatus("Đã xóa folder");
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleToggleStar(image: ImageRecord) {
    await api.toggleStar(activeVaultFolderId, image.filename);
    await refreshAll();
    showStatus(image.is_starred ? "Đã bỏ đánh dấu sao" : "Đã thêm vào ⭐ Đã đánh dấu");
  }

  async function handleAddToCollection(
    filename: string,
    collectionId: string,
  ) {
    try {
      await api.addToCollection(activeVaultFolderId, filename, collectionId);
      await refreshAll();
      showStatus("Đã thêm vào bộ sưu tập");
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleDeleteImage(filename: string) {
    await api.deleteImage(activeVaultFolderId, filename);
    setViewerIndex(null);
    setSelectedFilenames((prev) => {
      const next = new Set(prev);
      next.delete(filename);
      return next;
    });
    await refreshAll();
    showStatus("Đã xóa ảnh");
  }

  async function handleBulkAddToCollection(collectionId: string) {
    if (selectedCount === 0) return;
    const count = selectedCount;
    try {
      for (const filename of selectedFilenames) {
        await api.addToCollection(activeVaultFolderId, filename, collectionId);
      }
      clearSelection();
      await refreshAll();
      showStatus(`Đã thêm ${count} ảnh vào bộ sưu tập`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleBulkDelete() {
    if (selectedCount === 0) return;
    const count = selectedCount;
    if (
      !confirm(
        `Xóa ${count} ảnh đã chọn khỏi tất cả bộ sưu tập trên disk?`,
      )
    ) {
      return;
    }
    if (
      !confirm(
        `Xác nhận lần cuối: xóa vĩnh viễn ${count} ảnh? Thao tác này không thể hoàn tác.`,
      )
    ) {
      return;
    }

    for (const filename of selectedFilenames) {
      await api.deleteImage(activeVaultFolderId, filename);
    }
    clearSelection();
    setViewerIndex(null);
    await refreshAll();
    showStatus(`Đã xóa ${count} ảnh`);
  }

  async function handleOpenVaultFolder(vaultFolderId: string) {
    try {
      await api.openVaultFolder(vaultFolderId);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleOpenFolder(collectionId: string) {
    try {
      await api.openCollectionFolder(activeVaultFolderId, collectionId);
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

        <div className="sidebar-section sidebar-section-folders">
          <div className="section-header">
            <h3>Thư mục</h3>
            <button
              type="button"
              className="section-add-btn"
              onClick={() => setShowCreateVaultFolderModal(true)}
            >
              + Mới
            </button>
          </div>
          <nav className="sidebar-nav">
            {vaultFolders.map((folder) => (
              <div
                key={folder.id}
                className={`sidebar-row ${folder.id === activeVaultFolderId ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="sidebar-row-label"
                  onClick={() => setActiveVaultFolderId(folder.id)}
                >
                  <span className="sidebar-row-name">{folder.name}</span>
                </button>
                <div className="sidebar-row-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Đổi tên"
                    onClick={() => handleRenameVaultFolder(folder.id, folder.name)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Mở trên Explorer"
                    onClick={() => handleOpenVaultFolder(folder.id)}
                  >
                    ↗
                  </button>
                  {folder.id !== "Default" && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      title="Xóa folder"
                      onClick={() => handleDeleteVaultFolder(folder.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="sidebar-section sidebar-section-collections">
          <div className="section-header">
            <h3>Bộ sưu tập</h3>
            <button
              type="button"
              className="section-add-btn section-add-btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              + Mới
            </button>
          </div>

          <nav className="sidebar-nav sidebar-nav-scroll">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className={`sidebar-row ${collection.id === activeCollectionId ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="sidebar-row-label"
                  onClick={() => setActiveCollectionId(collection.id)}
                >
                  <span className="sidebar-row-name">{collection.name}</span>
                  <span className="count">{collection.image_count}</span>
                </button>
                <div className="sidebar-row-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Mở trên Explorer"
                    onClick={() => handleOpenFolder(collection.id)}
                  >
                    ↗
                  </button>
                  {!collection.is_system && (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Đổi tên"
                        onClick={() =>
                          handleRenameCollection(collection.id, collection.name)
                        }
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Xóa bộ sưu tập"
                        onClick={() => handleDeleteCollection(collection.id)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div className="toolbar-title">
            <div className="breadcrumb">
              <span>{activeVaultFolder?.name ?? activeVaultFolderId}</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">
                {activeCollection?.name ?? activeCollectionId}
              </span>
            </div>
            <p className="toolbar-subtitle">
              {images.length} ảnh
              {selectedCount > 0 && (
                <span className="toolbar-highlight"> · {selectedCount} đã chọn</span>
              )}
              <span className="toolbar-muted"> · Ctrl+V để paste</span>
            </p>
          </div>
          <div className="toolbar-actions">
            {images.length > 0 && (
              <button type="button" className="btn" onClick={toggleSelectAll}>
                {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => handleOpenFolder(activeCollectionId)}
            >
              Mở folder
            </button>
            <button type="button" className="btn primary" onClick={handlePasteButton}>
              Paste ảnh
            </button>
          </div>
        </header>

        {selectedCount > 0 && (
          <div className="bulk-bar">
            <div className="bulk-bar-info">
              <strong>{selectedCount}</strong>
              <span>ảnh đã chọn</span>
            </div>
            <div className="bulk-bar-actions">
              <select
                className="bulk-select"
                defaultValue=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    void handleBulkAddToCollection(value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Thêm vào bộ sưu tập...</option>
                {collections
                  .filter((c) => !c.is_system)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn danger"
                onClick={() => void handleBulkDelete()}
              >
                Xóa đã chọn
              </button>
              <button type="button" className="btn" onClick={clearSelection}>
                Bỏ chọn
              </button>
            </div>
          </div>
        )}

        {status && <div className="status-bar">{status}</div>}

        {images.length === 0 ? (
          <div className="empty">
            <p>Chưa có ảnh trong bộ sưu tập này.</p>
            <p>Chụp màn hình (Win+Shift+S) rồi nhấn Ctrl+V hoặc bấm Paste ảnh.</p>
          </div>
        ) : (
          <div className="gallery">
            {images.map((image, index) => {
              const isSelected = selectedFilenames.has(image.filename);
              return (
                <div
                  key={`${image.id}-${index}`}
                  className={`gallery-item ${isSelected ? "selected" : ""}`}
                >
                  <label
                    className="gallery-check"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(image.filename)}
                      aria-label={`Chọn ${image.filename}`}
                    />
                  </label>
                  <button
                    type="button"
                    className="gallery-open"
                    onClick={() => setViewerIndex(index)}
                  >
                    <img
                      src={convertFileSrc(image.file_path)}
                      alt={image.filename}
                      loading="lazy"
                    />
                  </button>
                  {image.is_starred && <span className="star-badge">★</span>}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showCreateVaultFolderModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCreateVaultFolderModal(false)}
        >
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateVaultFolder}
          >
            <h3>Tạo folder mới</h3>
            <p>
              Mỗi folder có bộ sưu tập riêng và ⭐ Đã đánh dấu độc lập.
            </p>
            <input
              autoFocus
              value={newVaultFolderName}
              onChange={(e) => setNewVaultFolderName(e.target.value)}
              placeholder="Tên folder (vd: Công việc, Game...)"
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowCreateVaultFolderModal(false)}>
                Hủy
              </button>
              <button type="submit" className="btn primary">
                Tạo
              </button>
            </div>
          </form>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateCollection}
          >
            <h3>Tạo bộ sưu tập mới</h3>
            <p>Ảnh sẽ nằm trong folder "{activeVaultFolder?.name ?? activeVaultFolderId}".</p>
            <input
              autoFocus
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="Tên bộ sưu tập..."
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowCreateModal(false)}>
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
          <button
            type="button"
            className="viewer-close"
            aria-label="Đóng"
            onClick={() => setViewerIndex(null)}
          >
            ✕
          </button>
          <div className="viewer" onClick={(e) => e.stopPropagation()}>
            <button
              className="nav-btn prev"
              disabled={viewerIndex === 0}
              onClick={() => setViewerIndex(viewerIndex - 1)}
            >
              ‹
            </button>

            <div className="viewer-content">
              <div
                ref={imageStageRef}
                className={`viewer-image-stage ${viewerZoom > 1 ? "is-panning" : ""}`}
                onMouseDown={handleImagePanStart}
              >
                <img
                  src={convertFileSrc(viewerImage.file_path)}
                  alt={viewerImage.filename}
                  draggable={false}
                  style={{
                    transform: `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom})`,
                  }}
                />
                <div
                  className="viewer-zoom-controls"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label="Thu nhỏ"
                    onClick={() => changeZoom(-ZOOM_STEP)}
                  >
                    −
                  </button>
                  <span>{Math.round(viewerZoom * 100)}%</span>
                  <button
                    type="button"
                    aria-label="Phóng to"
                    onClick={() => changeZoom(ZOOM_STEP)}
                  >
                    +
                  </button>
                  <button type="button" onClick={resetViewerTransform}>
                    Vừa khung
                  </button>
                </div>
              </div>
              <div className="viewer-footer">
                <div className="viewer-meta">
                  <span className="viewer-badge">
                    {viewerIndex + 1} / {images.length}
                  </span>
                  <span className="viewer-filename">{viewerImage.filename}</span>
                  <span>{viewerImage.created_at}</span>
                </div>
                <p className="viewer-hint">Cuộn chuột hoặc +/- để zoom · Esc để đóng</p>
                <div className="viewer-actions">
                  <button
                    type="button"
                    className={`btn ${viewerImage.is_starred ? "active" : ""}`}
                    onClick={() => handleToggleStar(viewerImage)}
                  >
                    {viewerImage.is_starred ? "★ Đã sao" : "☆ Đánh dấu sao"}
                  </button>

                  <select
                    className="viewer-select"
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
                    type="button"
                    className="btn danger"
                    onClick={() => handleDeleteImage(viewerImage.filename)}
                  >
                    Xóa ảnh
                  </button>
                </div>
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
