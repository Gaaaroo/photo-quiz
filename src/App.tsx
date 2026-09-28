import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api";
import type { Collection, ImageRecord, VaultFolder } from "./types";
import "./App.css";

type NavSnapshot = {
  vaultFolderId: string;
  collectionId: string;
  viewerIndex: number | null;
};

function sameNavSnapshot(a: NavSnapshot, b: NavSnapshot) {
  return (
    a.vaultFolderId === b.vaultFolderId &&
    a.collectionId === b.collectionId &&
    a.viewerIndex === b.viewerIndex
  );
}

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
  const [showAddToCollectionModal, setShowAddToCollectionModal] =
    useState(false);
  const [viewerNewCollectionName, setViewerNewCollectionName] = useState("");
  const [showCreateVaultFolderModal, setShowCreateVaultFolderModal] =
    useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(true);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(
    () => new Set(),
  );
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const imageStageRef = useRef<HTMLDivElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 });
  const [noteText, setNoteText] = useState("");
  const [savedNoteText, setSavedNoteText] = useState("");
  const [noteUpdatedAt, setNoteUpdatedAt] = useState("");
  const [noteStatus, setNoteStatus] = useState("");
  const [noteSourceFilename, setNoteSourceFilename] = useState<string | null>(
    null,
  );
  const noteSaveTimerRef = useRef<number | null>(null);
  const noteTextRef = useRef("");
  const savedNoteTextRef = useRef("");
  const noteFilenameRef = useRef<string | null>(null);
  const panDragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });
  const navHistoryRef = useRef<NavSnapshot[]>([]);
  const navCursorRef = useRef(-1);
  const ignoreNavRecordRef = useRef(false);
  const applyingHistoryRef = useRef(false);
  const navRestoreRef = useRef<NavSnapshot | null>(null);
  const navLiveRef = useRef<NavSnapshot>({
    vaultFolderId: "Default",
    collectionId: "Inbox",
    viewerIndex: null,
  });
  const lastNavFolderRef = useRef("Default");

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.05;

  const clampZoom = (value: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const resetViewerTransform = useCallback(() => {
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });
  }, []);

  const changeZoom = useCallback((delta: number) => {
    setViewerZoom((current) =>
      clampZoom(Number((current + delta).toFixed(2))),
    );
  }, []);

  const activeVaultFolder = vaultFolders.find(
    (folder) => folder.id === activeVaultFolderId,
  );
  const activeCollection = collections.find((c) => c.id === activeCollectionId);
  const viewerImage = viewerIndex !== null ? images[viewerIndex] : null;
  const availableCollectionsForViewer = viewerImage
    ? collections.filter(
        (c) =>
          !c.is_system && !viewerImage.collection_ids.includes(c.id),
      )
    : [];
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
      if (!collectionId) {
        setImages([]);
        return [] as ImageRecord[];
      }
      const data = await api.listImages(vaultFolderId, collectionId);
      setImages(data);
      return data;
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
    if (loading) return;

    let cancelled = false;
    void (async () => {
      const data = await api.listCollections(activeVaultFolderId);
      if (cancelled) return;
      setCollections(data);
      setActiveCollectionId((current) => {
        const restore = navRestoreRef.current;
        const wanted =
          restore && restore.vaultFolderId === activeVaultFolderId
            ? restore.collectionId
            : current;
        return data.some((collection) => collection.id === wanted)
          ? wanted
          : (data[0]?.id ?? "");
      });
      if (!applyingHistoryRef.current) {
        setViewerIndex(null);
        clearSelection();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeVaultFolderId, loading]);

  useEffect(() => {
    if (loading) return;

    let cancelled = false;
    void (async () => {
      const data = await refreshImages(activeVaultFolderId, activeCollectionId);
      if (cancelled) return;

      if (applyingHistoryRef.current) {
        const restore = navRestoreRef.current;
        if (
          restore &&
          restore.vaultFolderId === activeVaultFolderId &&
          restore.collectionId === activeCollectionId
        ) {
          ignoreNavRecordRef.current = true;
          if (restore.viewerIndex === null || data.length === 0) {
            setViewerIndex(null);
          } else {
            setViewerIndex(
              Math.max(0, Math.min(restore.viewerIndex, data.length - 1)),
            );
          }
          navRestoreRef.current = null;
        }
        applyingHistoryRef.current = false;
        window.setTimeout(() => {
          ignoreNavRecordRef.current = false;
        }, 0);
      } else {
        setViewerIndex(null);
        clearSelection();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCollectionId, activeVaultFolderId, loading, refreshImages]);

  useEffect(() => {
    navLiveRef.current = {
      vaultFolderId: activeVaultFolderId,
      collectionId: activeCollectionId,
      viewerIndex,
    };
  }, [activeVaultFolderId, activeCollectionId, viewerIndex]);

  useEffect(() => {
    if (loading) return;
    if (applyingHistoryRef.current) {
      lastNavFolderRef.current = activeVaultFolderId;
      return;
    }

    const folderJustChanged = lastNavFolderRef.current !== activeVaultFolderId;
    lastNavFolderRef.current = activeVaultFolderId;

    const record = () => {
      if (applyingHistoryRef.current) return;

      const next: NavSnapshot = {
        vaultFolderId: activeVaultFolderId,
        collectionId: activeCollectionId,
        viewerIndex,
      };
      const current = navHistoryRef.current[navCursorRef.current];

      if (ignoreNavRecordRef.current) {
        ignoreNavRecordRef.current = false;
        if (current && !sameNavSnapshot(current, next)) {
          navHistoryRef.current[navCursorRef.current] = next;
        }
        return;
      }

      if (current && sameNavSnapshot(current, next)) return;

      navHistoryRef.current = navHistoryRef.current.slice(
        0,
        navCursorRef.current + 1,
      );
      navHistoryRef.current.push(next);
      navCursorRef.current = navHistoryRef.current.length - 1;

      if (navHistoryRef.current.length > 80) {
        const drop = navHistoryRef.current.length - 80;
        navHistoryRef.current = navHistoryRef.current.slice(drop);
        navCursorRef.current -= drop;
      }
    };

    const timer = window.setTimeout(record, folderJustChanged ? 120 : 0);
    return () => window.clearTimeout(timer);
  }, [loading, activeVaultFolderId, activeCollectionId, viewerIndex]);

  const applyNavSnapshot = useCallback((snapshot: NavSnapshot) => {
    const live = navLiveRef.current;
    const needsReload =
      snapshot.vaultFolderId !== live.vaultFolderId ||
      snapshot.collectionId !== live.collectionId;
    ignoreNavRecordRef.current = true;
    applyingHistoryRef.current = needsReload;
    navRestoreRef.current = needsReload ? snapshot : null;
    setActiveVaultFolderId(snapshot.vaultFolderId);
    setActiveCollectionId(snapshot.collectionId);
    setViewerIndex(snapshot.viewerIndex);
    if (!needsReload) {
      window.setTimeout(() => {
        ignoreNavRecordRef.current = false;
      }, 0);
    }
  }, []);

  const goNavBack = useCallback(() => {
    if (navCursorRef.current <= 0) return;
    navCursorRef.current -= 1;
    applyNavSnapshot(navHistoryRef.current[navCursorRef.current]);
  }, [applyNavSnapshot]);

  const goNavForward = useCallback(() => {
    if (navCursorRef.current >= navHistoryRef.current.length - 1) return;
    navCursorRef.current += 1;
    applyNavSnapshot(navHistoryRef.current[navCursorRef.current]);
  }, [applyNavSnapshot]);

  const showStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2500);
  };

  const persistNote = useCallback(
    async (filename: string, text: string) => {
      const saved = await api.saveImageNote(activeVaultFolderId, filename, text);
      setSavedNoteText(saved.text);
      setNoteUpdatedAt(saved.updated_at);
      setNoteStatus(saved.text.trim() ? "Đã lưu" : "");
      setImages((prev) =>
        prev.map((image) =>
          image.filename === filename
            ? { ...image, has_note: saved.text.trim().length > 0 }
            : image,
        ),
      );
    },
    [activeVaultFolderId],
  );

  useEffect(() => {
    noteTextRef.current = noteText;
  }, [noteText]);

  useEffect(() => {
    savedNoteTextRef.current = savedNoteText;
  }, [savedNoteText]);

  useEffect(() => {
    const previousFilename = noteFilenameRef.current;
    const nextFilename = viewerImage?.filename ?? null;

    if (
      previousFilename &&
      previousFilename !== nextFilename &&
      noteTextRef.current !== savedNoteTextRef.current
    ) {
      const flushedFilename = previousFilename;
      const flushedText = noteTextRef.current;
      void api
        .saveImageNote(activeVaultFolderId, flushedFilename, flushedText)
        .then((saved) => {
          setImages((prev) =>
            prev.map((image) =>
              image.filename === flushedFilename
                ? { ...image, has_note: saved.text.trim().length > 0 }
                : image,
            ),
          );
        })
        .catch((err) => showStatus(String(err)));
    }

    noteFilenameRef.current = nextFilename;
  }, [activeVaultFolderId, viewerImage?.filename]);

  useEffect(() => {
    if (!viewerImage) {
      setNoteText("");
      setSavedNoteText("");
      setNoteUpdatedAt("");
      setNoteStatus("");
      setNoteSourceFilename(null);
      return;
    }

    const filename = viewerImage.filename;
    setNoteSourceFilename(null);
    setNoteText("");
    setSavedNoteText("");
    setNoteUpdatedAt("");
    setNoteStatus("");

    let cancelled = false;
    void (async () => {
      try {
        const note = await api.getImageNote(activeVaultFolderId, filename);
        if (cancelled) return;
        setNoteText(note.text);
        setSavedNoteText(note.text);
        setNoteUpdatedAt(note.updated_at);
        setNoteStatus("");
        setNoteSourceFilename(filename);
      } catch (err) {
        if (!cancelled) showStatus(String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeVaultFolderId, viewerImage?.filename]);

  useEffect(() => {
    if (!viewerImage) return;
    if (noteSourceFilename !== viewerImage.filename) return;
    if (noteText === savedNoteText) return;

    setNoteStatus("Đang lưu...");
    if (noteSaveTimerRef.current) {
      window.clearTimeout(noteSaveTimerRef.current);
    }
    const filename = viewerImage.filename;
    noteSaveTimerRef.current = window.setTimeout(() => {
      void persistNote(filename, noteText).catch((err) =>
        showStatus(String(err)),
      );
    }, 500);

    return () => {
      if (noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current);
      }
    };
  }, [
    noteText,
    savedNoteText,
    viewerImage?.filename,
    noteSourceFilename,
    persistNote,
  ]);

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;
        event.preventDefault();
        if (!activeCollectionId) {
          showStatus("Hãy tạo bộ sưu tập trước khi paste ảnh");
          return;
        }
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
    if (viewerIndex === null) {
      resetViewerTransform();
      setShowAddToCollectionModal(false);
      setViewerNewCollectionName("");
    }
  }, [viewerIndex, resetViewerTransform]);

  useEffect(() => {
    if (viewerIndex === null) return;
    const active = filmstripRef.current?.querySelector<HTMLElement>(
      `[data-thumb-index="${viewerIndex}"]`,
    );
    active?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [viewerIndex]);

  useEffect(() => {
    const stage = imageStageRef.current;
    if (!stage || viewerIndex === null) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setViewerZoom((current) =>
        clampZoom(Number((current + delta).toFixed(2))),
      );
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

  useEffect(() => {
    function isMouseBack(e: MouseEvent) {
      return e.button === 3;
    }

    function isMouseForward(e: MouseEvent) {
      return e.button === 4;
    }

    function blockBrowserNav(e: MouseEvent) {
      if (isMouseBack(e) || isMouseForward(e)) {
        e.preventDefault();
      }
    }

    function onMouseSideButton(e: MouseEvent) {
      if (!isMouseBack(e) && !isMouseForward(e)) return;
      e.preventDefault();
      if (
        showAddToCollectionModal ||
        showCreateModal ||
        showCreateVaultFolderModal
      ) {
        return;
      }

      if (isMouseBack(e)) {
        goNavBack();
      } else {
        goNavForward();
      }
    }

    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener("mousedown", blockBrowserNav, opts);
    window.addEventListener("mouseup", onMouseSideButton, opts);
    window.addEventListener("auxclick", blockBrowserNav, opts);
    return () => {
      window.removeEventListener("mousedown", blockBrowserNav, opts);
      window.removeEventListener("mouseup", onMouseSideButton, opts);
      window.removeEventListener("auxclick", blockBrowserNav, opts);
    };
  }, [
    goNavBack,
    goNavForward,
    showAddToCollectionModal,
    showCreateModal,
    showCreateVaultFolderModal,
  ]);

  function handleImagePanStart(e: React.MouseEvent) {
    if (e.button !== 0) return;
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
      const target = e.target as HTMLElement | null;
      const typingInField =
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (showAddToCollectionModal) {
          setShowAddToCollectionModal(false);
          setViewerNewCollectionName("");
        } else {
          setViewerIndex(null);
        }
        return;
      }

      if (typingInField) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const current = images[viewerIndex];
      if (!current) return;

      if (e.key === "ArrowLeft") {
        setViewerIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      } else if (e.key === "ArrowRight") {
        setViewerIndex((i) =>
          i !== null && i < images.length - 1 ? i + 1 : i,
        );
      } else if (e.key === "+" || e.key === "=") {
        changeZoom(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        changeZoom(-ZOOM_STEP);
      } else if (e.key === "0") {
        resetViewerTransform();
      } else if (e.key === "s" || e.key === "S" || e.key === "*") {
        e.preventDefault();
        void handleToggleStar(current);
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        void handleDeleteImage(current.filename);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, images, viewerZoom, changeZoom, resetViewerTransform, showAddToCollectionModal]);

  async function handlePasteButton() {
    if (!activeCollectionId) {
      showStatus("Hãy tạo bộ sưu tập trước khi paste ảnh");
      return;
    }
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
      const updated = await api.listCollections(activeVaultFolderId);
      setCollections(updated);
      if (activeCollectionId === id) {
        setActiveCollectionId(updated[0]?.id ?? "");
      }
      await refreshVaultFolders();
      await refreshImages(
        activeVaultFolderId,
        activeCollectionId === id ? (updated[0]?.id ?? "") : activeCollectionId,
      );
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
    try {
      const updated = await api.toggleStar(activeVaultFolderId, image.filename);
      const stillInView = updated.collection_ids.includes(activeCollectionId);

      if (!stillInView) {
        const deletedIndex = viewerIndex;
        const remainingCount = images.length - 1;
        setImages((prev) =>
          prev.filter((item) => item.filename !== image.filename),
        );
        if (deletedIndex === null || remainingCount <= 0) {
          setViewerIndex(null);
        } else if (deletedIndex >= remainingCount) {
          setViewerIndex(remainingCount - 1);
        } else {
          setViewerIndex(deletedIndex);
        }
      } else {
        setImages((prev) =>
          prev.map((item) =>
            item.filename === image.filename
              ? {
                  ...item,
                  is_starred: updated.is_starred,
                  collection_ids: updated.collection_ids,
                }
              : item,
          ),
        );
      }

      await refreshCollections(activeVaultFolderId);
      showStatus(
        updated.is_starred
          ? "Đã thêm vào ⭐ Đã đánh dấu"
          : "Đã bỏ đánh dấu sao",
      );
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleAddToCollection(
    filename: string,
    collectionId: string,
    options?: { closeModal?: boolean },
  ) {
    try {
      await api.addToCollection(activeVaultFolderId, filename, collectionId);
      if (options?.closeModal) {
        setShowAddToCollectionModal(false);
        setViewerNewCollectionName("");
      }
      await refreshAll();
      const collection = collections.find((c) => c.id === collectionId);
      showStatus(`Đã thêm vào ${collection?.name ?? collectionId}`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleCreateCollectionAndAdd(
    e: React.FormEvent,
    filename: string,
  ) {
    e.preventDefault();
    const trimmed = viewerNewCollectionName.trim();
    if (!trimmed) return;
    try {
      const created = await api.createCollection(
        activeVaultFolderId,
        trimmed,
      );
      await api.addToCollection(activeVaultFolderId, filename, created.id);
      setViewerNewCollectionName("");
      setShowAddToCollectionModal(false);
      await refreshAll();
      showStatus(`Đã tạo "${created.name}" và thêm ảnh`);
    } catch (err) {
      showStatus(String(err));
    }
  }

  async function handleDeleteImage(filename: string) {
    if (!activeCollectionId) return;
    const collectionName = activeCollection?.name ?? activeCollectionId;
    if (
      !confirm(
        `Xóa ảnh khỏi "${collectionName}"?\nẢnh vẫn giữ ở các bộ sưu tập khác (nếu có).`,
      )
    ) {
      return;
    }

    // Index hiện tại — sau khi xóa, ảnh kế tiếp sẽ dồn vào vị trí này
    const deletedIndex = viewerIndex;
    const remainingCount = images.length - 1;

    try {
      // Chỉ gỡ khỏi bộ sưu tập hiện tại, không xóa file khỏi các bộ khác
      await api.removeFromCollection(
        activeVaultFolderId,
        filename,
        activeCollectionId,
      );
      setSelectedFilenames((prev) => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
      await refreshAll();

      if (deletedIndex === null || remainingCount <= 0) {
        setViewerIndex(null);
      } else if (deletedIndex >= remainingCount) {
        setViewerIndex(remainingCount - 1);
      } else {
        setViewerIndex(deletedIndex);
      }

      showStatus(`Đã xóa ảnh khỏi ${collectionName}`);
    } catch (err) {
      showStatus(String(err));
    }
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
    if (selectedCount === 0 || !activeCollectionId) return;
    const count = selectedCount;
    const collectionName = activeCollection?.name ?? activeCollectionId;
    if (
      !confirm(
        `Xóa ${count} ảnh đã chọn khỏi "${collectionName}"? Ảnh vẫn giữ ở các bộ sưu tập khác (nếu có).`,
      )
    ) {
      return;
    }

    try {
      for (const filename of selectedFilenames) {
        await api.removeFromCollection(
          activeVaultFolderId,
          filename,
          activeCollectionId,
        );
      }
      clearSelection();
      setViewerIndex(null);
      await refreshAll();
      showStatus(`Đã xóa ${count} ảnh khỏi ${collectionName}`);
    } catch (err) {
      showStatus(String(err));
    }
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
                  onClick={() => {
                    if (folder.id === activeVaultFolderId) return;
                    setActiveVaultFolderId(folder.id);
                    setViewerIndex(null);
                  }}
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
                  onClick={() => {
                    if (collection.id === activeCollectionId) return;
                    setActiveCollectionId(collection.id);
                    setViewerIndex(null);
                  }}
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
            <button
              type="button"
              className="btn primary"
              disabled={!activeCollectionId}
              onClick={handlePasteButton}
            >
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

        {!activeCollectionId ? (
          <div className="empty">
            <p>Folder này chưa có bộ sưu tập.</p>
            <p>Bấm <strong>+ Mới</strong> ở sidebar để tạo bộ sưu tập đầu tiên.</p>
          </div>
        ) : images.length === 0 ? (
          <div className="empty">
            <p>Chưa có ảnh trong bộ sưu tập này.</p>
            <p>Chụp màn hình (Win+Shift+S) rồi nhấn Ctrl+V hoặc bấm Paste ảnh.</p>
          </div>
        ) : (
          <div className="gallery-scroll">
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
                      <span className="gallery-thumb">
                        <img
                          src={convertFileSrc(image.file_path)}
                          alt={image.filename}
                          loading="lazy"
                        />
                      </span>
                    </button>
                    {image.is_starred && <span className="star-badge">★</span>}
                    {image.has_note && (
                      <span className="note-badge" title="Có ghi chú">
                        ✎
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
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
              Folder mới bắt đầu trống. Tạo bộ sưu tập để lưu ảnh; ⭐ Đã đánh dấu
              xuất hiện khi bạn đánh dấu sao.
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

      {showAddToCollectionModal && viewerImage && (
        <div
          className="modal-backdrop add-collection-modal-backdrop"
          onClick={() => {
            setShowAddToCollectionModal(false);
            setViewerNewCollectionName("");
          }}
        >
          <div
            className="modal add-collection-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Thêm vào bộ sưu tập</h3>
            <p>Chọn bộ sưu tập để thêm ảnh này:</p>

            {availableCollectionsForViewer.length > 0 ? (
              <ul className="collection-picker-list">
                {availableCollectionsForViewer.map((collection) => (
                  <li key={collection.id}>
                    <button
                      type="button"
                      className="collection-picker-item"
                      onClick={() =>
                        void handleAddToCollection(
                          viewerImage.filename,
                          collection.id,
                          { closeModal: true },
                        )
                      }
                    >
                      <span className="collection-picker-name">
                        {collection.name}
                      </span>
                      <span className="collection-picker-meta">
                        {collection.image_count} ảnh
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="collection-picker-empty">
                Ảnh đã có trong tất cả bộ sưu tập hiện có.
              </p>
            )}

            <div className="collection-picker-create">
              <h4>Tạo bộ sưu tập mới</h4>
              <form
                onSubmit={(e) =>
                  void handleCreateCollectionAndAdd(e, viewerImage.filename)
                }
              >
                <input
                  autoFocus
                  value={viewerNewCollectionName}
                  onChange={(e) => setViewerNewCollectionName(e.target.value)}
                  placeholder="Tên bộ sưu tập mới..."
                />
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!viewerNewCollectionName.trim()}
                >
                  Tạo và thêm ảnh
                </button>
              </form>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowAddToCollectionModal(false);
                  setViewerNewCollectionName("");
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerImage && viewerIndex !== null && (
        <div className="viewer-backdrop">
          <div className={`viewer ${notesPanelOpen ? "is-notes-open" : ""}`}>
            <div className="viewer-main">
              <div
                ref={imageStageRef}
                className="viewer-image-stage is-panning"
                onMouseDown={handleImagePanStart}
              >
                <div
                  className="viewer-stage-top"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <span className="viewer-counter" title={`${activeVaultFolder?.name ?? activeVaultFolderId} / ${activeCollection?.name ?? activeCollectionId}`}>
                    <span className="viewer-counter-path">
                      {activeVaultFolder?.name ?? activeVaultFolderId}
                      <span className="viewer-counter-sep">/</span>
                      {activeCollection?.name ?? activeCollectionId}
                    </span>
                    <span className="viewer-counter-index">
                      {viewerIndex + 1}/{images.length}
                    </span>
                  </span>
                  <div className="viewer-stage-tools">
                    <button
                      type="button"
                      className={`viewer-notes-toggle ${notesPanelOpen ? "active" : ""} ${noteText.trim() ? "has-content" : ""}`}
                      onClick={() => setNotesPanelOpen((open) => !open)}
                    >
                      {notesPanelOpen ? "Ẩn ghi chú" : "Ghi chú"}
                    </button>
                    <div className="viewer-zoom-controls">
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
                    <button
                      type="button"
                      className="viewer-close"
                      aria-label="Đóng"
                      onClick={() => setViewerIndex(null)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="nav-btn prev"
                  disabled={viewerIndex === 0}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setViewerIndex(viewerIndex - 1)}
                >
                  ‹
                </button>

                <img
                  src={convertFileSrc(viewerImage.file_path)}
                  alt={viewerImage.filename}
                  draggable={false}
                  style={{
                    transform: `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom})`,
                  }}
                />

                <button
                  type="button"
                  className="nav-btn next"
                  disabled={viewerIndex === images.length - 1}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setViewerIndex(viewerIndex + 1)}
                >
                  ›
                </button>
              </div>

              <div className="viewer-image-actions">
                <button
                  type="button"
                  className={viewerImage.is_starred ? "is-starred" : ""}
                  onClick={() => void handleToggleStar(viewerImage)}
                >
                  {viewerImage.is_starred ? "★ Đã đánh dấu sao (S)" : "☆ Đánh dấu sao (S)"}
                </button>
                <button
                  type="button"
                  className="is-collection"
                  onClick={() => setShowAddToCollectionModal(true)}
                >
                  + Thêm vào bộ sưu tập
                </button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => void handleDeleteImage(viewerImage.filename)}
                >
                  Xóa khỏi bộ sưu tập (D)
                </button>
              </div>

              <div className="viewer-filmstrip-wrap">
                <div className="viewer-filmstrip" ref={filmstripRef}>
                  {images.map((image, index) => (
                    <button
                      key={`${image.id}-${index}`}
                      type="button"
                      data-thumb-index={index}
                      className={`viewer-thumb ${index === viewerIndex ? "active" : ""} ${image.has_note ? "has-note" : ""}`}
                      onClick={() => setViewerIndex(index)}
                    >
                      <img
                        src={convertFileSrc(image.file_path)}
                        alt=""
                        loading="lazy"
                      />
                      <span className="viewer-thumb-index">{index + 1}</span>
                    </button>
                  ))}
                </div>
                <div className="viewer-caption">
                  <span className="viewer-filename">{viewerImage.filename}</span>
                  <span>{viewerImage.created_at}</span>
                </div>
              </div>
            </div>

            {notesPanelOpen && (
            <aside className="viewer-sidebar">
              <section className="viewer-notes">
                <div className="viewer-notes-header">
                  <div>
                    <h3>Ghi chú</h3>
                    <p>Gắn với ảnh này — chuyển hình sẽ mở ghi chú tương ứng.</p>
                  </div>
                  <button
                    type="button"
                    className="viewer-close"
                    aria-label="Ẩn ghi chú"
                    onClick={() => setNotesPanelOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                <textarea
                  className="viewer-notes-input"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Viết ghi chú cho ảnh này: đáp án, giải thích, mẹo nhớ..."
                  spellCheck={false}
                />

                <div className="viewer-notes-footer">
                  <span>
                    {noteStatus ||
                      (noteUpdatedAt
                        ? `Cập nhật ${noteUpdatedAt}`
                        : "Chưa có ghi chú")}
                  </span>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={
                      noteSourceFilename !== viewerImage.filename ||
                      noteText === savedNoteText
                    }
                    onClick={() =>
                      void persistNote(viewerImage.filename, noteText).catch(
                        (err) => showStatus(String(err)),
                      )
                    }
                  >
                    Lưu
                  </button>
                </div>
              </section>
            </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
