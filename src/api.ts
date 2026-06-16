import { invoke } from "@tauri-apps/api/core";
import type { Collection, ImageRecord } from "./types";

export const api = {
  getVaultPath: () => invoke<string>("get_vault_path"),
  getDefaultCollectionId: () => invoke<string>("get_default_collection_id"),
  listCollections: () => invoke<Collection[]>("list_collections"),
  createCollection: (name: string) =>
    invoke<Collection>("create_collection", { name }),
  deleteCollection: (collectionId: string) =>
    invoke<void>("delete_collection", { collectionId }),
  listImages: (collectionId: string) =>
    invoke<ImageRecord[]>("list_images", { collectionId }),
  saveImageBytes: (
    bytes: number[],
    collectionId: string,
    mimeType?: string,
  ) =>
    invoke<ImageRecord>("save_image_bytes", {
      bytes,
      collectionId,
      mimeType,
    }),
  pasteFromClipboard: (collectionId: string) =>
    invoke<ImageRecord>("paste_from_clipboard", { collectionId }),
  toggleStar: (filename: string) =>
    invoke<ImageRecord>("toggle_star", { filename }),
  addToCollection: (filename: string, collectionId: string) =>
    invoke<ImageRecord>("add_to_collection", { filename, collectionId }),
  removeFromCollection: (filename: string, collectionId: string) =>
    invoke<ImageRecord>("remove_from_collection", { filename, collectionId }),
  deleteImage: (filename: string) =>
    invoke<void>("delete_image", { filename }),
  openCollectionFolder: (collectionId: string) =>
    invoke<void>("open_collection_folder", { collectionId }),
};
