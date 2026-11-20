# AGENTS.md — Đảo Đèn Lồng (Phase 1 → 3)

## Phạm vi hiện tại: Ticket-03 (Contract v1.2), đã gồm Ticket-02 và 3 Đêm
- **Luật cốt lõi đã đổi (Ticket-03):** đèn có nhiên liệu (số nguyên 1/60), Bóng Mực hút dầu (`drain`), thắng ở bình minh (không thắng sớm), sức chứa tăng dần. Đọc `docs/adr/0001-lantern-fuel-and-dawn-win.md` và `CHANGELOG.md` trước khi sửa luật. Không khôi phục luật cũ (thắng khi đủ đèn, đèn sáng mãi) khi sửa test.
- Hao dầu chạy ở bước 2, trước tương tác (bước 5): giữ thứ tự này.
- Khi luật mới làm test cũ sai: sửa hoặc xóa kèm lý do trong CHANGELOG, không `skip` âm thầm.
- Lõi game: `src/sim.js` (tất định, 60 tick/s, không DOM/GPU/đồng hồ thật). Bản đồ: `src/levels.js`. Số liệu: `src/config.js` (chỉ sửa ở đây, phải khớp `game.contract.json`; test `contract:` bắt lệch).
- **Thứ tự xử lý một tick là bắt buộc** (ticket Phần 1). Giữ nguyên các bước đánh số trong `Sim.step()`; thực thể mới sinh ở bước 10 chỉ tương tác từ tick sau.
- Headless: `src/headless.js` theo Contract v1.2 (`--night 1|2|3`, inputs có `dash`/`pause`). Lỗi định dạng → exit 2. Một Đêm đầy đủ phải chạy < 30 s.
- Bản 3D: `web/` (three.js) + `scripts/serve.js`. `web/` chỉ hiển thị và đọc input, **không thêm logic gameplay**; mọi luật nằm trong `Sim`. Âm thanh tổng hợp bằng WebAudio (`web/audio.js`), không file asset.
- Góc: đo từ +X hướng +Z, (x,z) = (r·cosθ, r·sinθ). Mét, Y lên.

## Quy trình làm việc
1. Đổi luật → sửa `Sim` + thêm/sửa test trong `tests/headless.test.js` (chạy CLI thật) + cập nhật `docs/notes/spec-phase*.md`.
2. `npm test` phải xanh trước khi nói "xong". Không viết test luôn đạt, không sửa tay output. Test cũ bị yêu cầu mới làm sai thì sửa kèm lý do trong ai-log.
3. Bản 3D: `node scripts/browser-check.mjs --night N --seconds 8 --out <png>` để lấy ảnh + FPS + lỗi JS từ trình duyệt thật. Chưa chạy thì ghi rõ "chưa kiểm chứng".
4. Sáng tạo thêm phải tắt khi headless và không đổi đầu ra contract.
5. Không commit `.env`/key. Không tự commit hoặc tag: người dùng review rồi commit/tag. Không thêm dòng Co-Authored-By/Claude vào commit.
6. Chỗ chưa đạt ghi "chưa đạt" kèm lý do (README, spec). Token/chi phí ghi vào `docs/notes/ai-log.md`.

## Skills
- `.claude/skills/verify-phase/SKILL.md`: checklist kiểm chứng trước khi tag.
