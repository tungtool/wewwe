# VUTUNGIOS — After Dark

Website nghe nhạc phong cách cinematic buồn, nền đêm mưa, kính mờ và chữ tâm sự chuyển động. Dự án dùng HTML, CSS và JavaScript thuần để mở/chạy nhanh, không cần cài package.

## Chạy website

1. Giải nén thư mục `vutungios-music`.
2. Mở `index.html` bằng Chrome, Edge hoặc Firefox.
3. Nhấn **Thêm nhạc của bạn** rồi chọn một hay nhiều file âm thanh trên thiết bị.
4. Chọn bài trong playlist và nhấn Play.

> Trình phát chỉ phát âm thanh thật từ file được chọn. Website không bao gồm file MP3 có bản quyền và không tải file nhạc lên máy chủ. Danh sách nhạc và đường dẫn object URL chỉ tồn tại trong phiên trình duyệt; khi tải lại trang, hãy chọn file lại.

## Định dạng âm thanh

Trình duyệt thường hỗ trợ MP3, M4A/AAC, WAV và OGG tùy thiết bị. Nếu file không phát được, hãy thử MP3 hoặc M4A khác.

## Đưa lên hosting tĩnh

Có thể tải thư mục này lên GitHub Pages, Cloudflare Pages, Netlify hoặc bất kỳ dịch vụ hosting tĩnh nào. Không cần backend và không cần lệnh build. Các font Google Fonts sẽ tải khi có Internet; nếu ngoại tuyến, trang dùng font dự phòng.

## Điều khiển

- Play / Pause: phát hoặc tạm dừng.
- Bài trước / bài tiếp theo.
- Thanh timeline: tua bài hát.
- Âm lượng: điều chỉnh âm lượng; thiết lập được lưu trong `localStorage`.
- Ngẫu nhiên, lặp playlist, lặp bài hiện tại.
- **Hiệu ứng nền**: tắt mưa và hiệu ứng chuyển động nền.
- **Sóng nhạc**: tắt/bật visualizer dựa trên Web Audio API khi trình duyệt hỗ trợ.
- **Chế độ tập trung**: mở màn hình nghe nhạc tối giản; nhấn Escape để thoát.
- Phím Space: phát/tạm dừng khi không nhập liệu.

## Tùy chỉnh

- Nội dung chữ tâm sự: chỉnh mảng `quotes` trong `app.js`.
- Màu sắc và font: chỉnh các biến CSS trong `:root` đầu file `styles.css`.
- Ảnh bìa và hình nền hiện được vẽ bằng CSS để trang tự chạy, không phụ thuộc ảnh stock bên ngoài.

## Cấu trúc

```text
vutungios-music/
├── index.html
├── styles.css
├── app.js
├── README.md
├── assets/
│   └── favicon.svg
└── music/
```
