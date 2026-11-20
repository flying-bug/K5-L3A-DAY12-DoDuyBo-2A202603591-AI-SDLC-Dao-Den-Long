# AGENTS.md — Đảo Đèn Lồng

- Lõi game: `src/sim.js` (tất định, 60 tick/s, không DOM, không thời gian thực). Số tuning chỉ sửa ở `src/config.js` và phải khớp `game.contract.json` (test `contract tuning matches` sẽ bắt lệch).
- Headless: `src/headless.js` theo Test Contract v1.0. Lỗi định dạng input/scenario → exit 2.
- Bản 3D: `web/` + `scripts/serve.js`, dùng lại `Sim`; không thêm logic gameplay vào `web/`.
- Test: `npm test` (chạy CLI thật). Không viết test luôn đạt, không sửa tay output. Chỗ chưa đạt ghi trung thực trong README.
- Phần sáng tạo thêm phải tắt khi headless và không đổi đầu ra contract.
- Không commit `.env`/key; không commit tự động (người dùng review và commit/tag).
- Quy ước: mét, Y lên, đất Y=0; tọa độ làm tròn 3 chữ số trong output.
