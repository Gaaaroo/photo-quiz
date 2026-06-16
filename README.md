# PhotoVault

App desktop (Tauri 2 + React) lưu ảnh **trực tiếp vào folder trên disk** — không dùng database.

## Cấu trúc folder

```
Documents/PhotoVault/
├── Inbox/                  ← paste mặc định
├── ⭐ Đã đánh dấu/         ← tự động khi bấm sao
├── ten-bo-suu-tap/         ← bộ sưu tập custom
└── ...
```

- Mỗi bộ sưu tập = 1 folder trên disk
- Paste ảnh → file `.png` / `.jpg` được ghi thẳng vào folder bộ sưu tập đang chọn
- Đánh dấu sao → hardlink/copy vào folder `⭐ Đã đánh dấu`
- Thêm vào bộ khác → hardlink/copy sang folder đó (không nhân bản dữ liệu nếu NTFS hỗ trợ hardlink)

## Chức năng

- Tạo / xóa bộ sưu tập (folder)
- Paste ảnh: **Ctrl+V** hoặc nút **Paste ảnh**
- Gallery xem ảnh theo bộ sưu tập
- Xem ảnh full: **← →** chuyển ảnh, **\*** đánh dấu sao, **Esc** đóng
- Thêm ảnh vào bộ sưu tập custom
- Mở folder trực tiếp trong Explorer

## Chạy app

Yêu cầu: Node.js, Rust (rustup), WebView2 (Windows).

```bash
npm install
npm run tauri dev
```

Build bản cài đặt:

```bash
npm run tauri build
```

## Phím tắt

| Phím | Tác dụng |
|------|----------|
| Ctrl+V | Paste ảnh vào bộ sưu tập đang chọn |
| ← → | Ảnh trước / sau (khi đang xem) |
| * | Bật/tắt sao |
| Esc | Đóng viewer |
