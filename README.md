# PhotoVault

App desktop (Tauri 2 + React) lưu ảnh **trực tiếp vào folder trên disk** — không dùng database.

## Cấu trúc folder

```
Documents/PhotoVault/
├── Default/                    ← folder mặc định
│   ├── Inbox/
│   ├── ⭐ Đã đánh dấu/         ← starred riêng của folder này
│   └── ten-bo-suu-tap/
├── Cong-viec/                  ← folder khác, starred độc lập
│   ├── Inbox/
│   ├── ⭐ Đã đánh dấu/
│   └── ...
```

- **Folder** = nhóm bộ sưu tập (mỗi folder độc lập)
- **Bộ sưu tập** = subfolder bên trong 1 folder
- **⭐ Đã đánh dấu** = riêng từng folder, không dùng chung
- Ảnh cũ ở layout phẳng sẽ tự chuyển vào `Default/`

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
