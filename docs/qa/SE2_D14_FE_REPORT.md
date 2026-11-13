# SE2-D14-FE — Robot chatbot 3D bằng Three.js

Ngày bàn giao: **13/11/2026 (UTC+07)**. Trạng thái: **READY FOR REVIEW**.

## Precondition và phạm vi

- Worktree `F:\RikkeiEdu\personal-finance-management-FE`, branch `feature/trang`, base `dev`.
- HEAD và `origin/dev` đầu nhiệm vụ cùng `1fd0f3a809c329de38d41f9c1b9e07d2c3f73d8f`; đã đối chiếu SHA trực tiếp trên remote. Không unmerged paths hoặc source sửa sẵn.
- Bảo toàn **36 file ảnh/log D13 chưa tracked**, kiểm tra SHA-256 trước/sau; giữ nguyên hai stash trên `feature/tuan` và `feature/trang`. Danh sách/checksum: [preserved-files.json](evidence/d14-fe/preserved-files.json).
- Clone FE không có `AGENTS.md` và `docs/CODEX_PROJECT_CONTEXT.md` local; áp dụng instructions người dùng, đối chiếu bản ở worktree chính đã đọc. Đã đọc widget, controller/service, components/charts, tests D13, package files, README và API Contract. Lịch Sprint 3 cũ gộp D14/D15 vào D13; giao việc trực tiếp ngày 13/11 này là phạm vi FE hiện tại, không tự sửa lịch/SRS.
- Sandbox có ownership khác: chỉ dùng `git -c safe.directory=...` từng lệnh; không đổi Git global config. Worktree FE nằm ngoài writable root mặc định, các lệnh ghi/chạy dùng quyền bổ sung đã được auto-review chấp thuận.
- Không sửa Backend, Chat API, DTO, Auth/JWT, controller nghiệp vụ, database, deployment hoặc governance. Không commit/push/PR/merge/deploy.

## Robot và tích hợp

Dùng geometry có sẵn: đầu RoundedBox xanh, mặt navy, mắt cyan, tai, antenna, nụ cười và thân nhỏ. Renderer trong suốt, ánh sáng ambient + directional dịu; không model tải ngoài, texture, shadow, bloom hoặc postprocessing.

| Trạng thái | Nguồn thật từ D13 | Biểu hiện |
| --- | --- | --- |
| IDLE | Chưa có phản hồi/lỗi/request đang chạy | Nhấp nhô/xoay rất nhẹ, chớp mắt chậm |
| LOADING | `state.loading` | Nghiêng đầu, mắt nhìn lên, antenna thay đổi nhẹ |
| SUCCESS | Tin nhắn cuối là assistant sau guard của controller | Mắt vui, màu cyan/mint, nhấp nhô nhẹ |
| ERROR | `state.error` khi không loading | Mắt amber, nghiêng đầu nhẹ; lỗi và Retry vẫn hiện bằng text trong chat |

Không tạo loading giả, timer trả lời giả hoặc request riêng trong production. State SUCCESS phản ánh câu trả lời đã được controller chấp nhận, không suy diễn từ nội dung hay gọi API thêm.

Launcher vẫn là HTML button 80×80, có aria-label mở/đóng, aria-expanded/controls, Enter/Space và focus ring. Canvas là trang trí (`aria-hidden`, tabindex -1); SVG robot D13 là fallback. Giữ suggested chips, context NLU, kỳ thực tế, biểu đồ, Retry, abort request, sequence/session revision, A/B và logout trong controller hiện có.

Một launcher/canvas giữ mounted qua mở/đóng chat. Panel được đặt phía trên robot để người dùng thấy trạng thái và có thể click đóng/mở; chừa Bottom Navigation + safe area. Các button/link trong panel có vùng tương tác tối thiểu 44px.

## Hiệu năng và tài nguyên

- Chỉ thêm **`three@0.187.0`** (`^0.187.0` trong manifest, lockfile pin 0.187.0); không thêm thư viện 3D, React Bits, shadcn hoặc Playwright.
- `React.lazy` + dynamic import tải Canvas/Three riêng; SVG có ngay. Engine tải sau idle với delay 1.2s, hoặc khi focus/pointer vào launcher. HTML production không preload chunk robot.
- Giới hạn DPR ≤1.5; máy ≤4 logical cores/≤4GB deviceMemory hoặc Save-Data dùng DPR ≤1, ít segment, không antialias. FPS tối đa 30, máy yếu 20.
- `prefers-reduced-motion`: pose tĩnh, không RAF liên tục; vẽ khi trạng thái/size thay đổi, hỗ trợ đổi preference khi đang chạy.
- Drawer, tab ẩn hoặc IntersectionObserver báo ngoài viewport sẽ pause RAF. Không tạo scene lần đầu khi launcher/tab đang ẩn.
- Cleanup observer/listener/RAF, dispose từng geometry/material và renderer, release context khi unmount thật. Lỗi WebGL init/render/shader/context lost chuyển SVG và không tự tạo context lặp lại.
- StrictMode development có thể setup–cleanup–setup lúc mount; tiêu chí là không có context sống dư và số context không tăng qua toggle panel, không dựa vào tổng số tạo ban đầu của StrictMode.

## File thay đổi

| File | Nội dung |
| --- | --- |
| `frontend/package.json`, `frontend/package-lock.json` | Thêm duy nhất three |
| `frontend/src/components/ai/AiAssistantWidget.jsx` | Launcher ngữ nghĩa luôn mounted, map trạng thái, bố trí panel và touch targets |
| `frontend/src/components/ai/AiRobotLauncher.jsx` | Lazy loading, Suspense và error boundary giữ SVG |
| `frontend/src/components/ai/AiRobotCanvas.jsx` | Lifecycle React, visibility và fallback |
| `frontend/src/components/ai/robotScene.js` | Scene geometry, biểu cảm, FPS/DPR/motion và dispose |
| `frontend/src/components/ai/robotState.js` | Chọn trạng thái từ snapshot D13 |
| `frontend/tests/aiAssistant.test.js` | Cập nhật assertion visibility và vị trí panel |
| `frontend/tests/robotLauncher.test.js` | 7 tests mapping state, SSR/SVG và launcher khi mở/đóng |
| `frontend/tests/robotScene.test.js` | 11 tests lifecycle, reduced motion, resource cleanup, shader/setup/render/context loss |
| `scripts/qa/d14_robot_qa.mjs`, `scripts/qa/d14_robot_fixture.jsx` | Chrome CDP và fixture cô lập, không đưa vào product flow |
| `docs/qa/SE2_D14_FE_REPORT.md`, `docs/qa/evidence/d14-fe/*` | Báo cáo, logs, metrics và screenshots mới |

## Validation tự động

| Lệnh | Kết quả bản chốt |
| --- | --- |
| `npm test` (cwd frontend) | **535 PASS, 0 FAIL, 0 cancelled/skipped**; gồm 517 tests D13 và 18 tests mới |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS**, có cảnh báo chunk >500kB |
| `git diff --check` | **PASS**, exit 0 ở bản chốt |

[Log tests](evidence/d14-fe/unit-tests.txt), [lint](evidence/d14-fe/lint.txt), [build](evidence/d14-fe/build.txt).

`npm audit` ghi nhận 5 advisory hiện có (4 moderate, 1 high), không advisory cho three; diff lockfile không nâng/hạ phiên bản dependency cũ. Không tự chạy audit fix hoặc đổi dependency ngoài task. [Audit JSON](evidence/d14-fe/npm-audit.json).

## Bundle trước/sau

Số liệu Vite production, kB thập phân; cùng worktree/manifest cũ trước khi thêm three, không đổi cấu hình chunk hay ngưỡng cảnh báo.

| Asset | Trước | Sau | Gzip trước → sau |
| --- | ---: | ---: | ---: |
| JS chính | 1.062,70 kB | 1.064,26 kB | 297,28 → 297,83 kB |
| JS Canvas + Three lazy | 0 | 540,35 kB | 0 → 135,03 kB |
| CSS chính | 143,39 kB | 144,48 kB | 22,57 → 22,61 kB |
| PNG logo cũ | 621,69 kB | 621,69 kB | Không thay đổi |

JS chính tăng **1,56 kB** (~0,55 kB gzip). Tổng JS nếu tải cả robot tăng **541,91 kB**; chi phí Three nằm ở chunk lazy, không được coi là miễn phí. Cảnh báo >500kB có sẵn ở bundle chính; sau thay đổi chunk robot cũng vượt ngưỡng. Không che warning, không tự thay cấu hình bundler. [Build baseline](evidence/d14-fe/baseline-build.txt).

## Browser QA

Computer Use bridge không khả dụng sau các lần thử; người dùng đã chỉ định dùng **harness Chrome CDP hiện có**. Chạy Chrome thật **157.0.8103.78**, headless, profile tạm riêng, Vite loopback `127.0.0.1:5184`. Không dùng profile người dùng, dữ liệu MySQL, JWT thật hoặc Gemini.

Fixture import widget/controller/components production. HTTP mock local trả success/error sau 1.5s; loading/Retry/context đến từ controller thật. Đây là kiểm thử UI với synthetic HTTP, **không phải Chat API Backend live/Gemini live PASS**.

Kết quả Chrome bản chốt: **23 PASS, 0 FAIL, 0 BLOCKED**. Các ảnh và metrics tại [browser-results.json](evidence/d14-fe/browser-results.json), [log chạy](evidence/d14-fe/browser-run.txt). Lượt trung gian 20 PASS/3 FAIL do hai chỗ CDP serialize DOM và keyboard thiếu key metadata; đã sửa harness và chạy lại toàn bộ, không sửa sản phẩm để né lỗi test.

| Nhóm Chrome QA | Kết quả |
| --- | --- |
| WebGL IDLE, loading/success, error/Retry | 3/3 PASS |
| NLU period, comparison chart D13 | 2/2 PASS |
| 5 viewport × 2 theme | 10/10 PASS |
| Enter/Space/Escape, focus | 1/1 PASS |
| 20 toggles giữ cùng canvas và 1 context | 1/1 PASS |
| Pause khi Drawer mở, reduced motion | 2/2 PASS |
| Unmount dispose, context lost, không WebGL | 3/3 PASS |
| Console không lỗi ngoài fault chủ động | 1/1 PASS |

Lỗi `Error creating WebGL context` trong log là fault được chủ động tạo để kiểm tra SVG fallback, không phải lỗi khởi tạo ở lượt bình thường. Đã xác minh robot renderer thực có WebGL draw calls và screenshot, không dùng SVG để báo 3D PASS. Khi reduced motion/Drawer ẩn, số draw calls liên tục tăng thêm là 0. Unmount thật phát sinh context-lost do release, dừng draw; các lần mở/đóng panel không tạo thêm context.

Ảnh minh họa: [320px Dark](evidence/d14-fe/320-dark.png), [1440px Light](evidence/d14-fe/1440-light.png), [IDLE](evidence/d14-fe/idle-1440-light.png), [loading](evidence/d14-fe/loading-1440-light.png), [success](evidence/d14-fe/success-1440-light.png), [error](evidence/d14-fe/error-1440-light.png), [reduced motion](evidence/d14-fe/reduced-motion.png), [context lost](evidence/d14-fe/context-lost-fallback.png), [không WebGL](evidence/d14-fe/no-webgl-fallback.png).

Đã xem trực tiếp screenshot 320px Dark và 1440px Light: robot render 3D rõ, không che nav; panel giữ nội dung và biểu đồ D13. Ma trận tự động bao gồm 320/375/430/768/1440 × Light/Dark, bốn state, Retry, NLU period, comparison chart, Enter/Space/Escape/focus, 20 toggles giữ canvas/context, Drawer pause, reduced motion, unmount dispose, context lost và WebGL không hỗ trợ.

## Giới hạn và bàn giao

- Chưa kiểm thử Chat API/Gemini live trong task này; regression API/controller/session A/B/abort được kiểm tra bằng bộ tests FE hiện có, không thay cho nghiệm thu BE.
- Chrome headless trên máy hiện tại không thay cho đo FPS/GPU/battery trên điện thoại thật, Safari/iOS hoặc QA màn hình đọc. DPR/FPS máy yếu được unit test bằng môi trường giả lập.
- Không kiểm thử production/staging và không deploy. Không sửa auth, schema hay API Contract.
- **READY FOR REVIEW** trong phạm vi FE local/Chrome fixture; không phải phê duyệt release. Không còn BLOCKED PRECONDITION. Commit chỉ sau phê duyệt riêng, ngày 13/11/2026 UTC+07; message dự kiến `feat: tích hợp robot AI 3D bằng Three.js vào chatbot`.
