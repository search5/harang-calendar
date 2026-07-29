# harang-calendar

[English](README.md) | 🌐 **한국어**

📖 **[문서](https://search5.github.io/harang-calendar/ko/)** (English / 한국어)

[CalDAV](https://www.rfc-editor.org/rfc/rfc4791) 캘린더의 일정을 노트에서 바로 조회할 수 있게 해주는 [Obsidian](https://obsidian.md) 플러그인입니다. 이 플러그인은 **조회 전용**이며, CalDAV 서버의 데이터를 생성/수정/삭제하지 않습니다.

## 기능

- **`{{hrcal:` 단계별 자동완성** — `{{hrcal:`을 입력하면 계정 → 캘린더 → (날짜 또는 이벤트 제목) 순서로 자동완성이 이어집니다. `{{hrcal:<계정이름>:<캘린더이름>:date:yyyy-mm-dd}}`(그 날짜의 이벤트 목록이 카드로 펼쳐지는 위젯) 또는 `{{hrcal:<계정이름>:<캘린더이름>:event:<uid>}}`(인라인 칩)이 삽입됩니다. 칩(또는 날짜 위젯 안의 카드)을 클릭하면 상세 팝업을 볼 수 있습니다.
- **캘린더 뷰** — 사이드바는 예정된 일정을 아젠다 목록으로, 전체 화면 탭은 월간 달력 그리드(이전/다음 달 이동, 날짜 클릭 시 그 날의 일정 표시)로 보여주며 둘 다 Vue 3로 구현됩니다.
- **다중 CalDAV 서버/캘린더** — 여러 서버 계정을 등록할 수 있고, 설정에서 각 계정의 연결을 테스트하고 캘린더를 탐색해 개별적으로 활성화/색상 지정할 수 있습니다.
- **타임존 설정** — 계정별로 IANA 타임존 또는 직접 UTC 시간차를 지정해, UTC가 아닌 이벤트 시각을 해석하는 데 사용합니다.
- **반복 일정** — `RRULE`/`EXDATE`를 조회 중인 범위 안에서 실제 발생 날짜로 전개합니다.
- **Obsidian 인터페이스 언어 추종** — Obsidian 언어 설정(공식 `getLanguage()` API)에 따라 한국어/영어로 표시됩니다.
- **오래된 참조 경고** — `{{hrcal:...}}` 참조에 담긴 계정 또는 캘린더 이름이 더 이상 설정된 항목과 일치하지 않으면(예: 이름을 바꾼 경우) 날짜 위젯에 경고를 표시합니다.

## 사전 요구사항

- Basic Auth로 접근 가능한 CalDAV 호환 캘린더 — 예: [Radicale](https://radicale.org/), Nextcloud Calendar, Fastmail 등 [RFC 4791](https://www.rfc-editor.org/rfc/rfc4791) 서버.
- Obsidian 1.12.7 이상.

## 설치

**설정 → 커뮤니티 플러그인 → 찾아보기**에서 **Harang Calendar**를 검색한 뒤 **설치**와 **활성화**를 클릭하세요.

미리 빌드된 파일을 직접 설치하고 싶으신가요? 문서의 [설치 안내](https://search5.github.io/harang-calendar/ko/installation.html)에서 그 방법과 다른 옵션들을 확인하세요.

## 사용법

1. **설정 → Harang Calendar**를 열고 **CalDAV 서버 추가**를 클릭해 계정을 설정한 뒤, **연결 테스트 및 탐색**으로 캘린더를 찾으세요.
2. 노트 안에서 `{{hrcal:`을 입력하고 계정 → 캘린더 → 날짜 또는 이벤트 순서로 선택해 참조를 삽입하세요.
3. **사이드바에서 캘린더 열기** 또는 **새 탭에서 캘린더 열기** 명령으로 언제든 일정을 확인할 수 있습니다.

자세한 내용은 [사용법 안내](https://search5.github.io/harang-calendar/ko/usage.html)를 참고하세요.

## 라이선스

BSD-3-Clause — [LICENSE](LICENSE) 참고.
