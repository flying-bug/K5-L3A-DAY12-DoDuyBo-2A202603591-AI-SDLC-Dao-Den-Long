# Credits

## Thư viện
- **three.js r160** — MIT License, © three.js authors — https://threejs.org (bản `three.module.js` được đóng gói kèm Release; giấy phép ở `node_modules/three/LICENSE`).

## Hình ảnh, mô hình, kết cấu
- Toàn bộ mô hình 3D (nhân vật Mây, Bóng Mực, Gió Lạc, đèn lồng, nhà, cổng, tháp, cây, động vật…) được **dựng bằng code** từ hình khối cơ bản của three.js.
- Toàn bộ kết cấu (cỏ, gạch Hội An, đá Huế, giấy đèn lồng, mây, ánh sáng) được **vẽ bằng Canvas 2D trong code** lúc chạy.
- Không dùng ảnh, mô hình, font hay asset bên ngoài nào. Font chữ là font hệ thống của trình duyệt.

## Âm thanh
- Nhạc nền và mọi hiệu ứng âm thanh được **tổng hợp bằng WebAudio** lúc chạy (`web/audio.js`). Không có file âm thanh.

## Bối cảnh và nhân vật
- Nhân vật, bối cảnh, tên gọi (Mây, Ông Đăng, Bóng Mực, Gió Lạc, Đèn Lồng Lớn) là bản gốc của lab Day 12. Diện mạo ba màn lấy cảm hứng từ Làng quê Bắc Bộ, Phố cổ Hội An và Cố đô Huế; không sao chép game hay phim có sẵn.

## Công cụ AI
- **Claude Code** (Anthropic; Sonnet 5.5 và Opus 5.5) — viết code, test, tài liệu và thiết kế cách dựng mô hình/kết cấu bằng code, dưới sự điều phối và kiểm chứng của tác giả. Chi tiết trong `docs/notes/ai-log.md` và `docs/retro.md`.
- Không dùng AI tạo ảnh, tạo âm thanh hay tạo mô hình 3D.

## Video demo
- `docs/demo/demo.mp4` quay tự động bằng script (do Claude Code viết): Chrome thật qua Chrome DevTools Protocol (screencast), phần chơi do bot gửi phím/cảm ứng; mã hóa bằng **ffmpeg** (bản kèm gói Python `imageio-ffmpeg`, LGPL/GPL) — https://ffmpeg.org. Không dùng AI tạo video.
