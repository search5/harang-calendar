# harang-calendar

[English](README.md) | 🌐 **한국어**

📖 **[문서](https://search5.github.io/harang-calendar/ko/)** (English / 한국어)

[CalDAV](https://www.rfc-editor.org/rfc/rfc4791) 캘린더의 일정을 노트에서 바로 조회할 수 있게 해주는 [Obsidian](https://obsidian.md) 플러그인입니다. 이 플러그인은 **조회 전용**이며, CalDAV 서버의 데이터를 생성/수정/삭제하지 않습니다.

> **현재 상태:** `AGENTS.md` 스펙이 모두 구현되었습니다. 남은 것은 필수는 아닌 개선 항목들뿐입니다. 상세 진행 상황과 알려진 제한사항은 [ROADMAP.md](ROADMAP.md)를 참고하세요.

## 기능

- **`@date[` 자동완성(날짜)** — `@date[2026-07-26`을 (타이핑하는 대로 점점 좁혀지며) 입력하고 팝업에서 선택하면 `[[cal:2026-07-26]]`이 삽입되고, 해당 날짜의 이벤트 목록이 카드로 펼쳐지는 위젯으로 렌더링됩니다.
- **`@event[` 자동완성(이벤트)** — `@event[` 뒤에 제목을 검색해 이벤트를 선택하면 `[[event:<uid>]]`이 삽입되고, 인라인 칩으로 렌더링됩니다. 칩(또는 날짜 위젯 안의 카드)을 클릭하면 상세 팝업을 볼 수 있습니다.
- **캘린더 뷰** — 사이드바는 예정된 일정을 아젠다 목록으로, 전체 화면 탭은 월간 달력 그리드(이전/다음 달 이동, 날짜 클릭 시 그 날의 일정 표시)로 보여주며 둘 다 Vue 3로 구현됩니다.
- **프론트매터 연결** — `harang-calendar: [이름, ...]` 프론트매터 키로 노트를 하나 이상의 캘린더에 연결(등록된 캘린더 이름 자동완성 포함)하면, 해당 노트의 날짜 위젯이 그 캘린더로 범위 제한됩니다.
- **다중 CalDAV 서버/캘린더** — 여러 서버 계정을 등록할 수 있고, 설정에서 각 계정의 연결을 테스트하고 캘린더를 탐색해 개별적으로 활성화/색상 지정할 수 있습니다.
- **타임존 설정** — 계정별로 IANA 타임존 또는 직접 UTC 시간차를 지정해, UTC가 아닌 이벤트 시각을 해석하는 데 사용합니다.
- **반복 일정** — `RRULE`/`EXDATE`를 조회 중인 범위 안에서 실제 발생 날짜로 전개합니다.
- **Obsidian 인터페이스 언어 추종** — Obsidian 언어 설정(공식 `getLanguage()` API)에 따라 한국어/영어로 표시됩니다.
- **프론트매터 검증** — 노트의 `harang-calendar` 프론트매터에 등록되지 않은 캘린더 이름이 있으면 날짜 위젯에 경고를 표시합니다.

## 사전 요구사항

- Basic Auth로 접근 가능한 CalDAV 호환 캘린더 — 예: [Radicale](https://radicale.org/), Nextcloud Calendar, Fastmail 등 [RFC 4791](https://www.rfc-editor.org/rfc/rfc4791) 서버.
- Obsidian 1.12.7 이상.

## 설치

**harang-calendar**는 아직 Obsidian 커뮤니티 플러그인 디렉토리에 등록되지 않아, 소스에서 직접 빌드해야 합니다.

**요구사항:** [Node.js](https://nodejs.org/) 18 이상

```bash
git clone https://github.com/search5/harang-calendar.git
cd harang-calendar
npm install
npm run build
```

빌드 결과물인 `main.js`와 `manifest.json`, `styles.css`를 `<vault>/.obsidian/plugins/harang-calendar/`에 복사한 뒤, **설정 → 커뮤니티 플러그인**에서 **Harang Calendar**를 활성화하세요.

## 개발

```bash
npm run dev    # esbuild watch 모드
npm run build  # 타입 체크 + 프로덕션 빌드
npm run lint   # eslint (eslint-plugin-obsidianmd 포함)
```

## 라이선스

BSD-3-Clause — [LICENSE](LICENSE) 참고.
