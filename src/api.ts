import { invoke } from "@tauri-apps/api/core";
import type { Collection, ImageRecord, VaultFolder } from "./types";

export const api = {
  getVaultPath: () => invoke<string>("get_vault_path"),
  getDefaultVaultFolderId: () => invoke<string>("get_default_vault_folder_id"),
  getDefaultCollectionId: () => invoke<string>("get_default_collection_id"),
  listVaultFolders: () => invoke<VaultFolder[]>("list_vault_folders"),
  createVaultFolder: (name: string) =>
    invoke<VaultFolder>("create_vault_folder", { name }),
  deleteVaultFolder: (vaultFolderId: string) =>
    invoke<void>("delete_vault_folder", { vaultFolderId }),
  renameVaultFolder: (vaultFolderId: string, newName: string) =>
    invoke<VaultFolder>("rename_vault_folder", { vaultFolderId, newName }),
  listCollections: (vaultFolderId: string) =>
    invoke<Collection[]>("list_collections", { vaultFolderId }),
  createCollection: (vaultFolderId: string, name: string) =>
    invoke<Collection>("create_collection", { vaultFolderId, name }),
  deleteCollection: (vaultFolderId: string, collectionId: string) =>
    invoke<void>("delete_collection", { vaultFolderId, collectionId }),
  renameCollection: (
    vaultFolderId: string,
    collectionId: string,
    newName: string,
  ) =>
    invoke<Collection>("rename_collection", {
      vaultFolderId,
      collectionId,
      newName,
    }),
  listImages: (vaultFolderId: string, collectionId: string) =>
    invoke<ImageRecord[]>("list_images", { vaultFolderId, collectionId }),
  saveImageBytes: (
    vaultFolderId: string,
    bytes: number[],
    collectionId: string,
    mimeType?: string,
  ) =>
    invoke<ImageRecord>("save_image_bytes", {
      vaultFolderId,
      bytes,
      collectionId,
      mimeType,
    }),
  pasteFromClipboard: (vaultFolderId: string, collectionId: string) =>
    invoke<ImageRecord>("paste_from_clipboard", {
      vaultFolderId,
      collectionId,
    }),
  toggleStar: (vaultFolderId: string, filename: string) =>
    invoke<ImageRecord>("toggle_star", { vaultFolderId, filename }),
  addToCollection: (
    vaultFolderId: string,
    filename: string,
    collectionId: string,
  ) =>
    invoke<ImageRecord>("add_to_collection", {
      vaultFolderId,
      filename,
      collectionId,
    }),
  removeFromCollection: (
    vaultFolderId: string,
    filename: string,
    collectionId: string,
  ) =>
    invoke<ImageRecord>("remove_from_collection", {
      vaultFolderId,
      filename,
      collectionId,
    }),
  deleteImage: (vaultFolderId: string, filename: string) =>
    invoke<void>("delete_image", { vaultFolderId, filename }),
  openVaultFolder: (vaultFolderId: string) =>
    invoke<void>("open_vault_folder", { vaultFolderId }),
  openCollectionFolder: (vaultFolderId: string, collectionId: string) =>
    invoke<void>("open_collection_folder", { vaultFolderId, collectionId }),
};
