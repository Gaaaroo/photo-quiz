export interface Collection {
  id: string;
  name: string;
  is_system: boolean;
  image_count: number;
}

export interface ImageRecord {
  id: string;
  filename: string;
  file_path: string;
  is_starred: boolean;
  created_at: string;
  collection_ids: string[];
}
