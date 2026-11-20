# Retro — Đảo Đèn Lồng (Day 12, AI SDLC)

Đỗ Duy Bộ · 2A202603591 · làm với Claude Code (Sonnet 5.5, Opus 5.5)

## 1. Tổng hợp Evaluation 4 phase

| Phase | Kết quả | Test | Điều tốt | Điều chưa tốt |
|---|---|---|---|---|
| 1 — PRD-0 | Đêm 1 chơi được, headless v1.0 | 12/12 | Tách lõi `Sim` tất định dùng chung cho headless và 3D ngay từ đầu, nên mọi phase sau chỉ cần sửa một chỗ | Bản 3D chưa được mở trong trình duyệt khi tag; mới chỉ kiểm chứng headless |
| 2 — Ba hòn đảo | 3 Đêm, contract v1.1, menu/HUD/âm thanh | 37/37 | Viết spec + AC trước, test Phần A (hồi quy với số chuẩn) và Phần B (tính năng mới); có `scripts/browser-check.mjs` để chụp ảnh và đo FPS trong trình duyệt thật | Lần đầu 5/37 fail, cả 5 do test sai. FPS khi render bằng CPU chỉ ~20–25, phải thêm hạ độ phân giải tự động |
| 3 — Đèn cạn dầu | Nhiên liệu, drain, thắng ở bình minh, v1.2 | 58/58 | ADR + CHANGELOG trước khi sửa code; chạy test cũ để thấy đúng 7 test bị luật mới làm sai rồi sửa/xóa có lý do, không skip | 4 test mới viết sai kỳ vọng; giao diện bối cảnh Việt Nam làm FPS (CPU) giảm |
| 4 — Phát hành | Bench, soak, bảng xếp hạng, đổi phím, phụ đề, Release | 75/75 | Đo trước rồi tối ưu: instancing Bóng Mực + shadow map theo nhu cầu đưa bench từ 64 FPS / p1-low 15 lên 105 / 36 trên GPU tích hợp | Chưa có video; vài chỉ báo trợ năng chưa xem bằng mắt |

## 2. Điều hiệu quả và không hiệu quả khi làm với AI

**Hiệu quả**
- Đưa nguyên văn ticket cho AI rồi yêu cầu viết AC/ADR trước khi code: ít sửa đi sửa lại.
- Lõi tất định + test chạy **CLI thật** (spawn tiến trình, đọc JSONL) thay vì gọi hàm nội bộ: test đúng cái giảng viên sẽ chạy.
- Một script đo trong trình duyệt thật (`browser-check.mjs`, rồi `bench.mjs` qua CDP) cho ảnh + FPS + lỗi JS thật; nhờ đó phát hiện "thanh trắng" là viền cát, Gió Lạc khó nhận ra, vách thềm Huế bị đen.
- Vá file lớn bằng script có `assert` số lần khớp chuỗi: sửa sai chỗ là dừng ngay, không lặng lẽ hỏng file.

**Không hiệu quả**
- Heredoc dài trong Bash nhiều lần lỗi quote; phải chuyển sang ghi file bằng công cụ Write.
- Làm cùng lúc nhiều yêu cầu giao diện (lễ hội → băng/dung nham → bối cảnh Việt Nam) tốn token cho phần bị bỏ (code băng/dung nham bị thay hẳn).
- FPS đo bằng render CPU (SwiftShader) không đại diện cho máy thật; lẽ ra nên chạy trình duyệt có GPU sớm hơn.

## 3. Những lần AI sai và cách phát hiện

| Lần | Sai | Phát hiện bằng |
|---|---|---|
| P1 | Test đặt đom đóm ngoài bán kính nhặt | Test fail, đọc kỳ vọng |
| P2 | 5 test sai (đỉnh bục nhảy ~4.8 m chứ không > 5; Bóng Mực > 18 m tự về `wander`; Bóng Mực thứ hai lấy mất đom đóm trong test Tỏa Sáng…) | Test fail → in snapshot từng tick để so với luật |
| P2 | Nói nhầm tag `phase-2` đã tồn tại | Kiểm tra `git tag --list` trước khi dời tag, đính chính ngay |
| P3 | Giả định đèn "đầy 100" bị bỏ qua khi bấm E; thực tế hao dầu chạy trước tương tác nên không bao giờ đầy đúng 100 | Test fail; đọc lại thứ tự tick của ticket; ghi vào ADR |
| P3 | Tính sai khoảng cách Mây–Bóng Mực (7 m chứ không < 6 m) và thời gian tới đèn | Test fail, tính lại bằng tay |
| P4 | Soak lần đầu vượt ngưỡng 1.2× RSS (45 → 55 MB) | Chạy lặp nhiều lần và chạy 100 Đêm: RSS đi ngang (JIT/heap), không phải rò rỉ; đo sau khi gc và sau 1 s chạy thử |
| P4 | Soak đạt trên Windows nhưng trượt trên GitHub Actions/Linux (48 → 61 MB): chạy thử chỉ Đêm 1, chưa tính phần tăng một lần khi gặp Đêm 2/3 | CI đỏ → tái hiện bằng Docker Linux, chạy 100 Đêm thấy đi ngang → chạy thử cả ba loại Đêm trước khi đo |
| P4 | Bench p1-low 15 FPS (không đạt) | Đo có chẩn đoán (CPU sim 0.4 ms, phần lớn ở `renderer.render`), xác định 800 draw call của Bóng Mực → instancing |

## 4. Harness giúp nhiều nhất

1. **AGENTS.md** — ghi các luật không được phá (lõi tất định, thứ tự tick, không thêm luật vào `web/`, không commit tự động, không dòng Co-Authored-By); mỗi phase được cập nhật (lịch sử git thể hiện).
2. **Test CLI headless** — là "lưới an toàn" khi luật đổi ở Phase 2 và 3: biết chính xác test nào bị luật mới làm sai.
3. **`scripts/browser-check.mjs` / `bench.mjs`** — bằng chứng giao diện và hiệu năng thật thay cho "agent bảo chạy rồi".
4. **Skill `verify-phase`** — checklist trước khi tag.
5. **Bộ nhớ của Claude Code** — nhớ quy tắc "không tự commit", "không thêm Claude vào commit", tên đúng của tác giả.

## 5. Token / chi phí ước tính và cách tiết kiệm

| Phase | Ước tính |
|---|---|
| 1 | 40–60k token |
| 2 | 150–200k token |
| 3 | 120–170k token (cả bối cảnh Việt Nam) |
| 4 | 150–200k token |
| **Tổng** | **~0.5–0.65 triệu token** (ước tính, không phải số đo; không có bảng chi phí chính xác trong phiên) |

Cách tiết kiệm: đọc file theo đoạn (`grep -n`, `sed -n`) thay vì đọc cả file; vá bằng script thay vì viết lại file lớn; chạy test và chỉ in dòng `pass/fail`; cắt output dài (`cut`, `head`); chạy headless thay cho trình duyệt khi kiểm luật; chụp ảnh chỉ khi đổi giao diện.

## 6. Nếu làm lại

- Mở trình duyệt có GPU và quay video ngắn ngay từ Phase 1, không để tới cuối.
- Chốt hướng mỹ thuật (bối cảnh Việt Nam) một lần trước khi trang trí, tránh làm rồi bỏ.
- Dựng instancing và đo hiệu năng từ Phase 2 (khi có nhiều Bóng Mực), không đợi tới benchmark.
- Viết test giao diện tự động (qua CDP) cho phụ đề và trợ năng thay vì chỉ chụp ảnh.
